import {one,db} from '@/lib/db';
import {requireUser,hash} from '@/lib/auth';
import {config} from '@/lib/config';
import {encrypt} from '@/lib/social';
import {xTokenExchange,xRedirect,xApi} from '@/lib/x-social';
export async function GET(request:Request){
 try{
  const user=await requireUser(),q=new URL(request.url).searchParams,code=q.get('code'),state=q.get('state');if(!code||!state)throw new Error('Authorization declined');
  const row=await one<{user_id:string;verifier:string}>('DELETE FROM social_oauth_states WHERE state_hash=$1 AND expires_at>now() RETURNING user_id,verifier',[hash(state)]);
  if(!row||row.user_id!==user.user_id||!row.verifier.startsWith('x:'))throw new Error('Invalid authorization state');
  const token=await xTokenExchange({code,grant_type:'authorization_code',redirect_uri:xRedirect(),code_verifier:row.verifier.slice(2),client_id:process.env.X_CLIENT_ID!});
  if(!token.refresh_token||!token.scope?.includes('tweet.write')||!token.scope?.includes('media.write'))throw new Error('Required X permissions declined');
  const profile=await xApi('https://api.x.com/2/users/me',token.access_token);
  if(!profile.data?.id)throw new Error('X account lookup failed');
  const saved={access:token.access_token,refresh:token.refresh_token,expires:Date.now()+token.expires_in*1000,scope:token.scope};
  await db.query("INSERT INTO social_connections(user_id,provider,refresh_token_cipher) VALUES($1,'x',$2) ON CONFLICT(user_id,provider) DO UPDATE SET refresh_token_cipher=EXCLUDED.refresh_token_cipher,updated_at=now()",[user.user_id,encrypt(JSON.stringify(saved))]);
  await db.query("INSERT INTO social_account_metadata(user_id,provider,remote_user_id,display_name) VALUES($1,'x',$2,$3) ON CONFLICT(user_id,provider) DO UPDATE SET remote_user_id=EXCLUDED.remote_user_id,display_name=EXCLUDED.display_name",[user.user_id,String(profile.data.id),String(profile.data.username||'')]);
  return Response.redirect(config.appUrl+'/dashboard?x=connected');
 }catch(e){console.error('X OAuth',e);return Response.redirect(config.appUrl+'/dashboard?x=failed');}
}
