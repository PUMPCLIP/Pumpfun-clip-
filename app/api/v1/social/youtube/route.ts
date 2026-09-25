import crypto from 'node:crypto';
import {db} from '@/lib/db';
import {requireUser,hash,random} from '@/lib/auth';
import {config} from '@/lib/config';
import {youtubeConfigured} from '@/lib/social';
export async function GET(){
 const user=await requireUser();if(!youtubeConfigured())return Response.json({code:'YOUTUBE_NOT_CONFIGURED'},{status:503});
 const state=random(),verifier=random(),challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
 await db.query('INSERT INTO social_oauth_states(state_hash,user_id,verifier) VALUES($1,$2,$3)',[hash(state),user.user_id,verifier]);
 const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');url.search=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID!,redirect_uri:config.appUrl+'/api/v1/social/youtube/callback',response_type:'code',scope:'https://www.googleapis.com/auth/youtube.upload',access_type:'offline',prompt:'consent',state,code_challenge:challenge,code_challenge_method:'S256'}).toString();
 return Response.redirect(url);
}
