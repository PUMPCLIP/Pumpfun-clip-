import {one,db} from './db';
import {balance} from './chain';
import {config} from './config';
import {ApiError} from './auth';
export async function gate(user:string,role:'streamer'|'clipper') {
  const wallet=await one<{id:string,address:string}>('SELECT id,address FROM wallets WHERE user_id=$1',[user]);
  if(!wallet) throw new ApiError('WALLET_REQUIRED',403);
  const roles=await one<{roles:string[]}>('SELECT roles FROM users WHERE id=$1',[user]);
  if(!roles?.roles.includes(role)) throw new ApiError('ROLE_REQUIRED',403);
  const checked=await balance(wallet.address), min=role==='streamer'?config.streamerMin:config.clipperMin;
  await db.query('INSERT INTO token_gate_checks(user_id,wallet_id,mint,network,balance_raw,slot) VALUES($1,$2,$3,$4,$5,$6)',[user,wallet.id,config.mint,config.cluster,checked.raw,checked.slot]);
  if(BigInt(checked.raw)<min) throw new ApiError('TOKEN_GATE_REQUIRED',403);
  return wallet;
}
