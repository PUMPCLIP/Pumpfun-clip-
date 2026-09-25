import {cookies} from 'next/headers';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {db,one} from '@/lib/db';
import {createSession,random} from '@/lib/auth';
import {config} from '@/lib/config';
export async function GET(request:Request) {
  const url=new URL(request.url), c=await cookies();
  const state=c.get('pc_oauth_state')?.value,nonce=c.get('pc_oauth_nonce')?.value;
  c.delete('pc_oauth_state'); c.delete('pc_oauth_nonce');
  if(!state || !nonce || url.searchParams.get('state')!==state || !url.searchParams.get('code')) return Response.redirect(config.appUrl+'/?error=oauth_state');
  try {
    const result=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({
      code:url.searchParams.get('code')!,client_id:process.env.GOOGLE_CLIENT_ID!,client_secret:process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri:config.appUrl+'/api/v1/auth/google/callback',grant_type:'authorization_code'
    })});
    if(!result.ok) throw new Error('OAuth token exchange failed');
    const tokens=await result.json();
    const {payload}=await jwtVerify(tokens.id_token,createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs')),{issuer:['https://accounts.google.com','accounts.google.com'],audience:process.env.GOOGLE_CLIENT_ID});
    if(payload.nonce!==nonce || !payload.sub || !payload.email || payload.email_verified!==true) throw new Error('Invalid Google identity');
    const user=await one<{id:string}>(
      "INSERT INTO users(google_sub,email,display_name) VALUES($1,$2,$3) ON CONFLICT(google_sub) DO UPDATE SET email=EXCLUDED.email,display_name=EXCLUDED.display_name,updated_at=now() RETURNING id",
      [payload.sub,payload.email,String(payload.name || payload.email)]);
    if(!user) throw new Error('User creation failed');
    await createSession(user.id); return Response.redirect(config.appUrl+'/dashboard');
  } catch(e) {console.error('oauth',e); return Response.redirect(config.appUrl+'/?error=oauth_failed');}
}
