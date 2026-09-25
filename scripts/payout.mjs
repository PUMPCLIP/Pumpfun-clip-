import fs from 'node:fs';
import pg from 'pg';
import bs58 from 'bs58';
import {Connection,Keypair,PublicKey,SystemProgram,Transaction} from '@solana/web3.js';
const [command,...args]=process.argv.slice(2);
const option=name=>{const i=args.indexOf('--'+name);return i<0?undefined:args[i+1];};
if(!['inspect','release','pay','reconcile'].includes(command)||!option('award')) throw new Error('Usage: node scripts/payout.mjs inspect|release|pay|reconcile --award UUID [--keypair PATH] [--execute]');
if(process.env.SOLANA_CLUSTER!=='devnet') throw new Error('Payout operator only supports devnet');
if(!process.env.SOL_TREASURY||!process.env.DATABASE_URL) throw new Error('Set SOL_TREASURY and DATABASE_URL');
const connection=new Connection(process.env.SOLANA_RPC_URL||'https://api.devnet.solana.com','confirmed');
if(await connection.getGenesisHash()!=='GH7ome3EiwEr7tu9JuTh2dpYWBJK3z69Xm1ZE3MEE6JC')throw new Error('RPC is not Solana devnet');
const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
const id=option('award'),execute=args.includes('--execute');
try {
  const query=async(sql,values=[])=>db.query(sql,values);
  const award=(await query('SELECT * FROM reward_awards WHERE id=$1',[id])).rows[0];
  if(!award) throw new Error('Award not found');
  if(command==='inspect') console.log(JSON.stringify({id,state:award.state,recipient:award.recipient,lamports:String(award.lamports),availableAt:award.available_at,signature:award.signature}));
  if(command==='release') {
    if(!execute){console.log('Dry run: release held award after 48h hold; rerun with --execute');process.exit(0);}
    const result=await query("UPDATE reward_awards SET state='ready',updated_at=now() WHERE id=$1 AND state='held' AND available_at<=now() RETURNING id",[id]);
    if(!result.rowCount) throw new Error('Award is not held or hold has not expired');
    console.log('Released',id);
  }
  if(command==='pay') {
    const file=option('keypair');if(!file) throw new Error('--keypair required');
    if((fs.statSync(file).mode&0o077)!==0) throw new Error('Keypair must have permissions 0600');
    const signer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file,'utf8'))));
    if(signer.publicKey.toBase58()!==process.env.SOL_TREASURY) throw new Error('Signer is not configured SOL_TREASURY');
    if(award.state!=='ready'&&award.state!=='broadcast') throw new Error('Award is not ready/broadcast');
    if(!execute){console.log(JSON.stringify({mode:'dry-run',recipient:award.recipient,lamports:String(award.lamports),state:award.state}));process.exit(0);}
    // PostgreSQL session lock prevents two payout workers acting on the same award.
    await query('SELECT pg_advisory_lock(hashtext($1))',[id]);
    try {
      const current=(await query('SELECT * FROM reward_awards WHERE id=$1',[id])).rows[0];
      if(current.state==='ready') {
        const lamports=Number(current.lamports);
        if(!Number.isSafeInteger(lamports)||lamports<=0) throw new Error('Unsafe lamport amount');
        if(await connection.getBalance(signer.publicKey,'confirmed')<lamports+10000) throw new Error('Custody balance too low');
        const tx=new Transaction().add(SystemProgram.transfer({fromPubkey:signer.publicKey,toPubkey:new PublicKey(current.recipient),lamports}));
        tx.feePayer=signer.publicKey;tx.recentBlockhash=(await connection.getLatestBlockhash('confirmed')).blockhash;tx.sign(signer);
        const signed=tx.serialize(),signature=bs58.encode(tx.signature);
        // Persist the exact signed transaction before network broadcast. A crash cannot silently create a second transfer.
        await query("UPDATE reward_awards SET state='broadcast',signed_transaction=$2,signature=$3,updated_at=now() WHERE id=$1 AND state='ready'",[id,signed.toString('base64'),signature]);
        current.signed_transaction=signed.toString('base64');current.signature=signature;
      }
      const status=await connection.getSignatureStatus(current.signature,{searchTransactionHistory:true});
      if(status.value?.err) throw new Error('On-chain transaction failed; inspect before retry');
      if(!status.value) await connection.sendRawTransaction(Buffer.from(current.signed_transaction,'base64'),{skipPreflight:false,maxRetries:2});
      console.log(JSON.stringify({signature:current.signature,state:'broadcast',next:'Run reconcile after confirmation. If blockhash expires, inspect chain manually; never create a replacement automatically.'}));
    } finally {await query('SELECT pg_advisory_unlock(hashtext($1))',[id]);}
  }
  if(command==='reconcile') {
    if(award.state!=='broadcast'||!award.signature) throw new Error('Award has no broadcast transaction');
    const tx=await connection.getParsedTransaction(award.signature,{commitment:'confirmed',maxSupportedTransactionVersion:0});
    if(!tx||tx.meta?.err) throw new Error('No successful confirmed transfer found');
    const matched=tx.transaction.message.instructions.some(i=>'parsed' in i && i.program==='system' && i.parsed.type==='transfer' && i.parsed.info.source===process.env.SOL_TREASURY && i.parsed.info.destination===award.recipient && BigInt(i.parsed.info.lamports)===BigInt(award.lamports));
    if(!matched) throw new Error('On-chain transfer does not match award');
    if(!execute){console.log('Verified confirmed transfer',award.signature,'; rerun with --execute to book paid');process.exit(0);}
    await query('BEGIN');
    try {
      const changed=await query("UPDATE reward_awards SET state='paid',paid_at=now(),updated_at=now() WHERE id=$1 AND state='broadcast' RETURNING id",[id]);
      if(changed.rowCount){await query('UPDATE escrow_accounts SET reserved_lamports=reserved_lamports-$2,paid_lamports=paid_lamports+$2,updated_at=now() WHERE campaign_id=$1',[award.campaign_id,award.lamports]);await query("UPDATE submissions SET state='rewarded',updated_at=now() WHERE id=$1",[award.submission_id]);}
      await query('COMMIT');console.log('Reconciled',award.signature);
    }catch(e){await query('ROLLBACK');throw e;}
  }
}finally{await db.end();}
