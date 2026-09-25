import {one,db} from './db';
import {decrypt,encrypt} from './social';
import {ApiError} from './auth';
export const tiktokConfigured=()=>!!(process.env.TIKTOK_CLIENT_KEY&&process.env.TIKTOK_CLIENT_SECRET&&process.env.SOCIAL_TOKEN_KEY);
export async function tiktokToken(userId:string){
 const connection=await one<{refresh_token_cipher:string}>("SELECT refresh_token_cipher FROM social_connections WHERE user_id=$1 AND provider='tiktok'",[userId]);
 if(!connection)throw new ApiError('TIKTOK_CONNECTION_REQUIRED',403);
 const response=await fetch('https://open.tiktokapis.com/v2/oauth/token/',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_key:process.env.TIKTOK_CLIENT_KEY!,client_secret:process.env.TIKTOK_CLIENT_SECRET!,grant_type:'refresh_token',refresh_token:decrypt(connection.refresh_token_cipher)}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new ApiError('TIKTOK_RECONNECT_REQUIRED',409);
 const data=await response.json();if(!data.access_token||!data.refresh_token||!String(data.scope).split(',').includes('video.upload'))throw new ApiError('TIKTOK_UPLOAD_SCOPE_REQUIRED',403);
 if(data.refresh_token!==decrypt(connection.refresh_token_cipher))await db.query("UPDATE social_connections SET refresh_token_cipher=$2,updated_at=now() WHERE user_id=$1 AND provider='tiktok'",[userId,encrypt(data.refresh_token)]);
 return data.access_token as string;
}
export function tiktokUploadUrl(value:string){const url=new URL(value);if(url.protocol!=='https:'||!(url.hostname==='open-upload.tiktokapis.com'||/^upload\.[a-z0-9-]+\.tiktokapis\.com$/.test(url.hostname)))throw new ApiError('TIKTOK_UPLOAD_HOST_INVALID',502);return url.toString();}
