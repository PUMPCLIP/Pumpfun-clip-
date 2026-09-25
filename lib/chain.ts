import {Connection,PublicKey} from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import {config} from './config';
import {ApiError} from './auth';
const connection=()=>new Connection(config.rpc,'confirmed');
export const DEVNET_GENESIS='GH7ome3EiwEr7tu9JuTh2dpYWBJK3z69Xm1ZE3MEE6JC';
export async function assertDevnet(){
  if(config.cluster!=='devnet') throw new ApiError('DEVNET_REQUIRED',503);
  try {if(await connection().getGenesisHash()!==DEVNET_GENESIS) throw new ApiError('RPC_CLUSTER_MISMATCH',503);}
  catch(e){if(e instanceof ApiError)throw e;throw new ApiError('RPC_UNAVAILABLE',503);}
}
export function address(s:string) {try {return new PublicKey(s);} catch {throw new ApiError('INVALID_ADDRESS');}}
export function verifyWalletSignature(message:string,signature:string,wallet:string) {
  try {return nacl.sign.detached.verify(new TextEncoder().encode(message),bs58.decode(signature),address(wallet).toBytes());}
  catch {return false;}
}
export async function balance(wallet:string) {
  if(!config.mint) throw new ApiError('TOKEN_MINT_NOT_CONFIGURED',503);
  try {
    const c=connection(), mint=address(config.mint), owner=address(wallet);
    const accounts=await c.getParsedTokenAccountsByOwner(owner,{mint},'confirmed');
    const total=accounts.value.reduce((sum,entry)=>sum+BigInt(entry.account.data.parsed.info.tokenAmount.amount),0n);
    return {raw:total.toString(),slot:accounts.context.slot};
  } catch(e) {if(e instanceof ApiError) throw e; throw new ApiError('RPC_UNAVAILABLE',503);}
}
export async function verifyTokenTransfer(signature:string,from:string,to:string,mint:string,amount:bigint) {
  try {
    const transaction=await connection().getParsedTransaction(signature,{commitment:'confirmed',maxSupportedTransactionVersion:0});
    if(!transaction || transaction.meta?.err) throw new ApiError('CHAIN_VERIFICATION_PENDING',409);
    const pre=transaction.meta?.preTokenBalances || [],post=transaction.meta?.postTokenBalances || [];
    const total=(balances:typeof pre,owner:string)=>balances.filter(b=>b.owner===owner && b.mint===mint).reduce((n,b)=>n+BigInt(b.uiTokenAmount.amount),0n);
    if(total(post,to)-total(pre,to)<amount || total(pre,from)-total(post,from)<amount) throw new ApiError('TRANSFER_MISMATCH',422);
    return true;
  } catch(e) {if(e instanceof ApiError) throw e; throw new ApiError('RPC_UNAVAILABLE',503);}
}
export async function verifySolTransfer(signature:string,from:string,to:string,amount:bigint) {
  try {
    const t=await connection().getParsedTransaction(signature,{commitment:'confirmed',maxSupportedTransactionVersion:0});
    if(!t || !t.meta || t.meta.err) throw new ApiError('CHAIN_VERIFICATION_PENDING',409);
    const accounts=t.transaction.message.accountKeys.map(k=>k.pubkey.toBase58());
    const recipient=accounts.indexOf(to),sender=accounts.indexOf(from);
    const matching=t.transaction.message.instructions.some(i=>'parsed' in i && i.program==='system' &&
      i.parsed.type==='transfer' && i.parsed.info.source===from && i.parsed.info.destination===to &&
      BigInt(i.parsed.info.lamports)>=amount);
    if(!matching || recipient<0 || sender<0 || !t.transaction.message.accountKeys[sender].signer ||
      BigInt(t.meta.postBalances[recipient]-t.meta.preBalances[recipient])<amount ||
      BigInt(t.meta.preBalances[sender]-t.meta.postBalances[sender])<amount) throw new ApiError('TRANSFER_MISMATCH',422);
    return true;
  } catch(e) {if(e instanceof ApiError) throw e; throw new ApiError('RPC_UNAVAILABLE',503);}
}
