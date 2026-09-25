import {requireUser,random,hash} from '@/lib/auth';
import {db} from '@/lib/db';
import {xConfigured,xRedirect,xChallenge} from '@/lib/x-social';
export async function GET(){
 const user=await requireUser();if(!xConfigured())return Response.json({code:'X_NOT_CONFIGURED'},{status:503});
 const state=random(),verifier=random()+random();
 await db.query('INSERT INTO social_oauth_states(state_hash,user_id,verifier) VALUES($1,$2,$3)',[hash(state),user.user_id,'x:'+verifier]);
 const url=new URL('https://x.com/i/oauth2/authorize');
 url.search=new URLSearchParams({response_type:'code',client_id:process.env.X_CLIENT_ID!,redirect_uri:xRedirect(),scope:'tweet.read tweet.write users.read media.write offline.access',state,code_challenge:xChallenge(verifier),code_challenge_method:'S256'}).toString();
 return Response.redirect(url);
}
