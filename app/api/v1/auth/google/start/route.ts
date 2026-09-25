import {cookies} from 'next/headers';
import {random} from '@/lib/auth';
import {config} from '@/lib/config';
export async function GET() {
  if(!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return Response.json({code:'GOOGLE_NOT_CONFIGURED'}, {status:503});
  const state=random(),nonce=random(), c=await cookies();
  c.set('pc_oauth_state',state,{httpOnly:true,secure:config.appUrl.startsWith('https:'),sameSite:'lax',maxAge:600,path:'/'});
  c.set('pc_oauth_nonce',nonce,{httpOnly:true,secure:config.appUrl.startsWith('https:'),sameSite:'lax',maxAge:600,path:'/'});
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id',process.env.GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri',config.appUrl+'/api/v1/auth/google/callback');
  url.searchParams.set('response_type','code'); url.searchParams.set('scope','openid email profile');
  url.searchParams.set('state',state); url.searchParams.set('nonce',nonce);
  return Response.redirect(url);
}
