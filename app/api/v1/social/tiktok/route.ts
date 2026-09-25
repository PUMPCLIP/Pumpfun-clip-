import {db} from '@/lib/db';
import {requireUser,hash,random} from '@/lib/auth';
import {config} from '@/lib/config';
import {tiktokConfigured,tiktokDirectEnabled} from '@/lib/tiktok';
export async function GET(request:Request){
 const user=await requireUser();if(!tiktokConfigured())return Response.json({code:'TIKTOK_NOT_CONFIGURED'},{status:503});
 const direct=new URL(request.url).searchParams.get('mode')==='publish';
 if(direct&&!tiktokDirectEnabled())return Response.json({code:'TIKTOK_DIRECT_NOT_ENABLED'},{status:503});
 const state=random();await db.query('INSERT INTO social_oauth_states(state_hash,user_id,verifier) VALUES($1,$2,$3)',[hash(state),user.user_id,direct?'tiktok-direct':'tiktok-draft']);
 const url=new URL('https://www.tiktok.com/v2/auth/authorize/');url.search=new URLSearchParams({client_key:process.env.TIKTOK_CLIENT_KEY!,response_type:'code',scope:direct?'video.upload,video.publish':'video.upload',redirect_uri:config.appUrl+'/api/v1/social/tiktok/callback',state}).toString();return Response.redirect(url);
}
