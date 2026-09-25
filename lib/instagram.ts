import {one} from './db';
import {decrypt} from './social';
import {ApiError} from './auth';
export const metaVersion=()=>process.env.META_GRAPH_VERSION||'v25.0';
export const instagramConfigured=()=>!!(process.env.META_APP_ID&&process.env.META_APP_SECRET&&process.env.SOCIAL_TOKEN_KEY&&process.env.MEDIA_BUCKET);
export async function instagramUserToken(userId:string){
 const row=await one<{refresh_token_cipher:string}>("SELECT refresh_token_cipher FROM social_connections WHERE user_id=$1 AND provider='instagram'",[userId]);
 if(!row)throw new ApiError('INSTAGRAM_CONNECTION_REQUIRED',403);return decrypt(row.refresh_token_cipher);
}
export type InstagramPage={pageId:string;name:string;igId:string;token:string};
export async function instagramPages(userId:string):Promise<InstagramPage[]>{
 const token=await instagramUserToken(userId);
 const url=new URL('https://graph.facebook.com/'+metaVersion()+'/me/accounts');url.searchParams.set('fields','id,name,access_token,tasks,instagram_business_account');url.searchParams.set('limit','100');
 const response=await fetch(url,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
 const data=await response.json();if(!response.ok||!Array.isArray(data.data))throw new ApiError('INSTAGRAM_RECONNECT_REQUIRED',409);
 // Only Pages with a linked professional account and create-content permission are selectable.
 return data.data.filter((page:any)=>page.instagram_business_account?.id&&page.access_token&&page.tasks?.includes('CREATE_CONTENT')).map((page:any)=>({pageId:String(page.id),name:String(page.name),igId:String(page.instagram_business_account.id),token:String(page.access_token)}));
}
