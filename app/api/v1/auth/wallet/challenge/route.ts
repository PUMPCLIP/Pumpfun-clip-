import {z} from 'zod';
import {one} from '@/lib/db';
import {ApiError,assertOrigin,hash,jsonError,random} from '@/lib/auth';
import {config} from '@/lib/config';
import {address} from '@/lib/chain';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const inputSchema=z.object({address:z.string().min(32).max(50),provider:z.enum(['phantom','jupiter'])});

export async function POST(request:Request){
  try{
    await assertOrigin(request);
    const parsed=inputSchema.safeParse(await request.json().catch(()=>null));
    if(!parsed.success)throw new ApiError('INVALID_INPUT',400,parsed.error.issues.map(issue=>issue.message).join('; '));
    const walletAddress=address(parsed.data.address).toBase58();
    const recent=await one<{count:string}>(
      `SELECT count(*)::text AS count FROM wallet_challenges
       WHERE user_id IS NULL AND address=$1 AND created_at>now()-interval '15 minutes'`,
      [walletAddress],
    );
    if(Number(recent?.count||0)>=5)throw new ApiError('RATE_LIMITED',429,'Too many wallet sign-in attempts. Wait a few minutes and try again.');

    const nonce=random();
    const expiresAt=new Date(Date.now()+5*60_000).toISOString();
    const message=`PUMPCLIP wallet sign-in\nDomain: ${new URL(config.appUrl).host}\nNetwork: ${config.cluster}\nWallet: ${walletAddress}\nProvider: ${parsed.data.provider}\nNonce: ${nonce}\nExpires: ${expiresAt}`;
    const challenge=await one<{id:string}>(
      `INSERT INTO wallet_challenges(user_id,address,nonce_hash,message,expires_at)
       VALUES(NULL,$1,$2,$3,now()+interval '5 minutes') RETURNING id`,
      [walletAddress,hash(nonce),message],
    );
    if(!challenge)throw new Error('Wallet login challenge was not created');
    return Response.json({id:challenge.id,message,expiresInSeconds:300},{headers:{'Cache-Control':'no-store, max-age=0'}});
  }catch(error){return jsonError(error,crypto.randomUUID());}
}
