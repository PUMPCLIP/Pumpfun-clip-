import {one,db} from '@/lib/db';
import {requireUser,hash} from '@/lib/auth';
import {config} from '@/lib/config';
import {encrypt} from '@/lib/social';
export async function GET(request:Request){
 try{
  const user=await requireUser(),params=new URL(request.url).searchParams,code=params.get('code'),state=params.get('state');
  if(!code||!state)throw new Error('Authorization declined');
  const row=await one<{user_id:string}>('DELETE FROM social_oauth_states WHERE state_hash=$1 AND expires_at>now() RETURNING user_id',[hash(state)]);
  if(!row||row.user_id!==user.user_id)throw new Error('Invalid authorization state');
  const response=await fetch('https://open.tiktokapis.com/v2/oauth/token/',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_key:process.env.TIKTOK_CLIENT_KEY!,client_secret:process.env.TIKTOK_CLIENT_SECRET!,code,grant_type:'authorization_code',redirect_uri:config.appUrl+'/api/v1/social/tiktok/callback'}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('TikTok token exchange failed');const data=await response.json();
  if(!data.refresh_token||!String(data.scope).split(',').includes('video.upload'))throw new Error('TikTok upload permission not granted');
  await db.query("INSERT INTO social_connections(user_id,provider,refresh_token_cipher) VALUES($1,'tiktok',$2) ON CONFLICT(user_id,provider) DO UPDATE SET refresh_token_cipher=EXCLUDED.refresh_token_cipher,updated_at=now()",[user.user_id,encrypt(data.refresh_token)]);
  return Response.redirect(config.appUrl+'/dashboard?tiktok=connected');
 }catch(e){console.error('TikTok OAuth',e);return Response.redirect(config.appUrl+'/dashboard?tiktok=failed');}
}
