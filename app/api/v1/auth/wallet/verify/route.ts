import {z} from 'zod';
import {audit,one,tx} from '@/lib/db';
import {ApiError,assertOrigin,createSession,hash,jsonError} from '@/lib/auth';
import {config} from '@/lib/config';
import {verifyWalletSignature} from '@/lib/chain';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const inputSchema=z.object({challengeId:z.string().uuid(),signature:z.string().min(40).max(120),provider:z.enum(['phantom','jupiter'])});
type Challenge={id:string;address:string;message:string};
type WalletOwner={user_id:string;deleted_at:string|null};
type UserRow={id:string};

export async function POST(request:Request){
  try{
    await assertOrigin(request);
    const parsed=inputSchema.safeParse(await request.json().catch(()=>null));
    if(!parsed.success)throw new ApiError('INVALID_INPUT',400,parsed.error.issues.map(issue=>issue.message).join('; '));

    const result=await tx(async client=>{
      const challenge=await one<Challenge>(
        `SELECT id,address,message FROM wallet_challenges
         WHERE id=$1 AND user_id IS NULL AND used_at IS NULL AND expires_at>now() FOR UPDATE`,
        [parsed.data.challengeId],client,
      );
      const correctProvider=challenge?.message.includes(`\nProvider: ${parsed.data.provider}\n`)||false;
      if(!challenge||!correctProvider||!verifyWalletSignature(challenge.message,parsed.data.signature,challenge.address)){
        throw new ApiError('INVALID_SIGNATURE',422,'The wallet signature was not accepted. Request a fresh sign-in message and try again.');
      }
      const used=await one<{id:string}>(
        `UPDATE wallet_challenges SET used_at=now()
         WHERE id=$1 AND user_id IS NULL AND used_at IS NULL AND expires_at>now() RETURNING id`,
        [challenge.id],client,
      );
      if(!used)throw new ApiError('WALLET_CHALLENGE_USED',409,'This wallet sign-in message has already been used.');

      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[challenge.address]);
      const linked=await one<WalletOwner>(
        `SELECT w.user_id,u.deleted_at FROM wallets w JOIN users u ON u.id=w.user_id
         WHERE w.address=$1 FOR UPDATE OF w`,
        [challenge.address],client,
      );
      let userId:string;
      let newAccount=false;
      if(linked){
        if(linked.deleted_at)throw new ApiError('ACCOUNT_DELETED',410,'This wallet belongs to a deleted PumpClip account. Contact support to restore it.');
        userId=linked.user_id;
        await client.query('UPDATE wallets SET is_primary=false,updated_at=now() WHERE user_id=$1 AND is_primary=true AND address<>$2',[userId,challenge.address]);
        await client.query('UPDATE wallets SET is_primary=true,network=$2,provider=$3,updated_at=now() WHERE user_id=$1 AND address=$4',[userId,config.cluster,parsed.data.provider,challenge.address]);
      }else{
        const email=`wallet-${hash(challenge.address)}@wallet.pumpclip.invalid`;
        const displayName=`Wallet ${challenge.address.slice(0,4)}…${challenge.address.slice(-4)}`;
        const created=await one<UserRow>(
          `INSERT INTO users(google_sub,email,display_name,auth_provider,email_verified)
           VALUES(NULL,$1,$2,'wallet',false) RETURNING id`,
          [email,displayName],client,
        );
        if(!created)throw new Error('Wallet user provisioning failed');
        userId=created.id;
        await client.query(
          `INSERT INTO wallets(user_id,address,network,provider,is_embedded,is_primary)
           VALUES($1,$2,$3,$4,false,true)`,
          [userId,challenge.address,config.cluster,parsed.data.provider],
        );
        newAccount=true;
      }
      await audit(client,userId,'auth.wallet.sign_in','wallet',challenge.id,{address:challenge.address,provider:parsed.data.provider,newAccount});
      return {userId,wallet:challenge.address,newAccount};
    });

    await createSession(result.userId);
    return Response.json({ok:true,wallet:result.wallet,newAccount:result.newAccount},{headers:{'Cache-Control':'no-store, max-age=0'}});
  }catch(error){return jsonError(error,crypto.randomUUID());}
}
