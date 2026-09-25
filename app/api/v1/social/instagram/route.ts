import {requireUser,random,hash} from '@/lib/auth';
import {db} from '@/lib/db';
import {config} from '@/lib/config';
import {instagramConfigured,metaVersion} from '@/lib/instagram';
export async function GET(){
 const user=await requireUser();if(!instagramConfigured())return Response.json({code:'INSTAGRAM_NOT_CONFIGURED'},{status:503});
 const state=random();await db.query('INSERT INTO social_oauth_states(state_hash,user_id,verifier) VALUES($1,$2,$3)',[hash(state),user.user_id,'instagram']);
 const url=new URL('https://www.facebook.com/'+metaVersion()+'/dialog/oauth');
 url.search=new URLSearchParams({client_id:process.env.META_APP_ID!,redirect_uri:config.appUrl+'/api/v1/social/instagram/callback',state,response_type:'code',scope:'pages_show_list,pages_read_engagement,instagram_basic,instagram_content_publish'}).toString();
 return Response.redirect(url);
}
