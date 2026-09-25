import {one,db} from '@/lib/db';
import {requireUser,hash} from '@/lib/auth';
import {config} from '@/lib/config';
import {encrypt} from '@/lib/social';
import {metaVersion} from '@/lib/instagram';
export async function GET(request:Request){
 try{
  const user=await requireUser(),q=new URL(request.url).searchParams,code=q.get('code'),state=q.get('state');if(!code||!state)throw new Error('Authorization declined');
  const row=await one<{user_id:string;verifier:string}>('DELETE FROM social_oauth_states WHERE state_hash=$1 AND expires_at>now() RETURNING user_id,verifier',[hash(state)]);
  if(!row||row.user_id!==user.user_id||row.verifier!=='instagram')throw new Error('Invalid authorization state');
  const tokenUrl=new URL('https://graph.facebook.com/'+metaVersion()+'/oauth/access_token');
  for(const [key,value] of Object.entries({client_id:process.env.META_APP_ID!,client_secret:process.env.META_APP_SECRET!,redirect_uri:config.appUrl+'/api/v1/social/instagram/callback',code}))tokenUrl.searchParams.set(key,value);
  const response=await fetch(tokenUrl,{signal:AbortSignal.timeout(15000)});const short=await response.json();if(!response.ok||!short.access_token)throw new Error('Meta token exchange failed');
  const longUrl=new URL('https://graph.facebook.com/'+metaVersion()+'/oauth/access_token');
  for(const [key,value] of Object.entries({grant_type:'fb_exchange_token',client_id:process.env.META_APP_ID!,client_secret:process.env.META_APP_SECRET!,fb_exchange_token:short.access_token}))longUrl.searchParams.set(key,value);
  const upgraded=await fetch(longUrl,{signal:AbortSignal.timeout(15000)});const long=await upgraded.json();if(!upgraded.ok||!long.access_token)throw new Error('Meta long-lived token exchange failed');
  await db.query("INSERT INTO social_connections(user_id,provider,refresh_token_cipher) VALUES($1,'instagram',$2) ON CONFLICT(user_id,provider) DO UPDATE SET refresh_token_cipher=EXCLUDED.refresh_token_cipher,updated_at=now()",[user.user_id,encrypt(long.access_token)]);
  return Response.redirect(config.appUrl+'/dashboard?instagram=connected');
 }catch(e){console.error('Instagram OAuth',e);return Response.redirect(config.appUrl+'/dashboard?instagram=failed');}
}
