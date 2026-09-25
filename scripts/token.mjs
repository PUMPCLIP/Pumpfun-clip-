import fs from 'node:fs';
import {Connection,Keypair,PublicKey} from '@solana/web3.js';
import {createMint,getOrCreateAssociatedTokenAccount,mintTo,getMint} from '@solana/spl-token';
const [command,...args]=process.argv.slice(2);
const value=(name)=>{const i=args.indexOf('--'+name);return i<0?undefined:args[i+1];};
const execute=args.includes('--execute');
if(!['create','distribute'].includes(command)) throw new Error('Usage: node scripts/token.mjs create|distribute --keypair PATH [--mint ADDRESS] [--allocations FILE] [--execute]');
if(process.env.SOLANA_CLUSTER!=='devnet') throw new Error('Token operations are devnet only. Mainnet issuance requires a separately reviewed runbook.');
const rpc=process.env.SOLANA_RPC_URL||'https://api.devnet.solana.com';
const signerPath=value('keypair');
if(!signerPath) throw new Error('--keypair is required');
const stat=fs.statSync(signerPath);
if((stat.mode&0o077)!==0) throw new Error('Keypair must have permissions 0600');
const signer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(signerPath,'utf8'))));
const connection=new Connection(rpc,'confirmed');
if(await connection.getGenesisHash()!=='GH7ome3EiwEr7tu9JuTh2dpYWBJK3z69Xm1ZE3MEE6JC')throw new Error('RPC is not Solana devnet');
const decimals=Number(process.env.PUMPCLIP_DECIMALS||6);
if(!Number.isInteger(decimals)||decimals<0||decimals>9) throw new Error('Invalid decimals');
const decimalAmount=s=>{if(typeof s!=='string'||!new RegExp(`^(0|[1-9][0-9]*)(\\.[0-9]{1,${decimals}})?$`).test(s)) throw new Error('Invalid amount '+s);const [whole,fraction='']=s.split('.');return BigInt(whole)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,'0'));};
if(command==='create') {
  if(!execute) {console.log(JSON.stringify({operation:'create devnet SPL mint',payer:signer.publicKey.toBase58(),decimals,mintAuthority:signer.publicKey.toBase58(),freezeAuthority:null,mode:'dry-run'}));process.exit(0);}
  const mint=await createMint(connection,signer,signer.publicKey,null,decimals);
  console.log(JSON.stringify({mint:mint.toBase58(),network:'devnet',decimals,mintAuthority:signer.publicKey.toBase58(),note:'Set PUMPCLIP_MINT only after recording and verifying this address.'}));
} else {
  const mintAddress=value('mint'),file=value('allocations');
  if(!mintAddress||!file) throw new Error('Distribution requires --mint and --allocations');
  const mint=new PublicKey(mintAddress);
  const info=await getMint(connection,mint);
  if(!info.mintAuthority?.equals(signer.publicKey)||info.decimals!==decimals) throw new Error('Mint authority or decimals mismatch');
  const recipients=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!Array.isArray(recipients)||!recipients.length||recipients.length>1000) throw new Error('Expected 1–1000 allocations');
  const seen=new Set(),allocations=recipients.map(({address,amount})=>{const owner=new PublicKey(address);if(seen.has(address)) throw new Error('Duplicate recipient '+address);seen.add(address);const raw=decimalAmount(amount);if(raw<=0n||raw>BigInt('18446744073709551615')) throw new Error('Invalid allocation');return {address,amount,raw,owner};});
  console.log(JSON.stringify({mint:mintAddress,network:'devnet',mode:execute?'execute':'dry-run',allocations:allocations.map(({address,amount})=>({address,amount})),totalRaw:String(allocations.reduce((n,a)=>n+a.raw,0n))}));
  if(!execute) process.exit(0);
  // Each confirmed signature is printed immediately so an interrupted run can be reconciled before rerunning.
  for(const a of allocations){const ata=await getOrCreateAssociatedTokenAccount(connection,signer,mint,a.owner);const signature=await mintTo(connection,signer,mint,ata.address,signer,a.raw);console.log(JSON.stringify({address:a.address,amount:a.amount,signature}));}
}
