import crypto from 'node:crypto';
import {requireUser,jsonError} from '@/lib/auth';
import {Connection} from '@solana/web3.js';
import {config} from '@/lib/config';
import {solscanUrl} from '@/lib/trading';
export const runtime='nodejs';

export async function GET(request:Request){
  try{
    await requireUser();
    const signature=new URL(request.url).searchParams.get('signature')||'';
    if(!/^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(signature)) throw new Error('INVALID_SIGNATURE');
    const status=(await new Connection(config.rpc,'confirmed').getSignatureStatuses([signature])).value[0];
    return Response.json({signature,status:status?.confirmationStatus||'pending',error:status?.err||null,solscanUrl:solscanUrl(signature)});
  }catch(error){return jsonError(error,crypto.randomUUID());}
}
