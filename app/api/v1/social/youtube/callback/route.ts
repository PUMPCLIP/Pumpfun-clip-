import {db,one} from '@/lib/db';
import {requireUser,hash} from '@/lib/auth';
import {config} from '@/lib/config';
import {encrypt} from '@/lib/social';
export async function GET(request:Request){
 try{
  const user=await requireUser(),params=new URL(request.url).searchParams,code=params.get('code'),state=params.get('state');
  if(!code||!state)throw new Error('Missing authorization');
  const row=await one<{user_id:string;verifier:string}>('DELETE FROM social_oauth_states WHERE state_hash=$1 AND expires_at>now() RETURNING user_id,verifier',[hash(state)]);
  if(!row||row.user_id!==user.user_id)throw new Error('Invalid authorization state');
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:process.env.GOOGLE_CLIENT_ID!,client_secret:process.env.GOOGLE_CLIENT_SECRET!,redirect_uri:config.appUrl+'/api/v1/social/youtube/callback',grant_type:'authorization_code',code_verifier:row.verifier})});
  if(!response.ok)throw new Error('Authorization exchange failed');const data=await response.json();
  if(!data.refresh_token)throw new Error('No refresh token granted');
  await db.query(`INSERT INTO social_connections(user_id,provider,refresh_token_cipher) VALUES($1,'youtube',$2) ON CONFLICT(user_id,provider) DO UPDATE SET refresh_token_cipher=EXCLUDED.refresh_token_cipher,updated_at=now()`,[user.user_id,encrypt(data.refresh_token)]);
  return Response.redirect(config.appUrl+'/dashboard?youtube=connected');
 }catch(e){console.error('YouTube OAuth',e);return Response.redirect(config.appUrl+'/dashboard?youtube=failed');}
}
