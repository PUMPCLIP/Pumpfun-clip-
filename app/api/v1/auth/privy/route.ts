import {verifyIdentityToken} from '@privy-io/node';
import {db,one} from '@/lib/db';
import {createSession,jsonError,ApiError} from '@/lib/auth';
import {verifyPrivyToken} from '@/lib/privy';
import {address} from '@/lib/chain';
import {config} from '@/lib/config';

export const runtime='nodejs';

export async function POST(request:Request) {
  try {
    const body=await request.json().catch(()=>null) as {accessToken?:string;identityToken?:string}|null;
    if(!body?.accessToken) throw new ApiError('PRIVY_TOKEN_REQUIRED',400);
    const identity=await verifyPrivyToken(body.accessToken);
    const appId=process.env.NEXT_PUBLIC_PRIVY_APP_ID!,verificationKey=process.env.PRIVY_VERIFICATION_KEY!;
    let email=`${identity.userId.replace(/[^a-zA-Z0-9_-]/g,'_')}@privy.invalid`,displayName='PUMPCLIP creator',emailVerified=false,walletAddress='';
    if(body.identityToken) {
      const user=await verifyIdentityToken({identity_token:body.identityToken,app_id:appId,verification_key:verificationKey}) as any;
      if(user.id!==identity.userId) throw new ApiError('PRIVY_IDENTITY_MISMATCH',401);
      for(const account of user.linked_accounts||[]) {
        if(account.type==='email' && account.address) {email=String(account.address).toLowerCase();emailVerified=true;}
        if(account.type==='wallet' && account.chain_type==='solana' && account.address) walletAddress=String(account.address);
        if(!displayName || displayName==='PUMPCLIP creator') displayName=String(account.name||account.username||email);
      }
    }
    if(walletAddress) address(walletAddress);
    const user=await one<{id:string}>(`INSERT INTO users(privy_user_id,google_sub,email,display_name,auth_provider,email_verified)
      VALUES($1,NULL,$2,$3,'privy',$4)
      ON CONFLICT(privy_user_id) DO UPDATE SET email=EXCLUDED.email,display_name=EXCLUDED.display_name,email_verified=EXCLUDED.email_verified,updated_at=now()
      RETURNING id`,[identity.userId,email,displayName,emailVerified]);
    if(!user) throw new Error('Privy user provisioning failed');
    if(walletAddress) await db.query(`INSERT INTO wallets(user_id,address,network,provider,is_embedded,is_primary)
      VALUES($1,$2,$3,'privy_embedded',true,NOT EXISTS(SELECT 1 FROM wallets WHERE user_id=$1))
      ON CONFLICT(user_id,address) DO UPDATE SET updated_at=now(),provider='privy_embedded',is_embedded=true`,[user.id,walletAddress,config.cluster]);
    await createSession(user.id);
    return Response.json({ok:true,provider:'privy',userId:user.id,wallet:walletAddress||undefined});
  } catch(error) { return jsonError(error,crypto.randomUUID()); }
}
