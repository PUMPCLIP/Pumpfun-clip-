import {one} from './db';
import {decrypt} from './social';
import {ApiError} from './auth';
export async function youtubeAccessToken(userId:string){
 const connection=await one<{refresh_token_cipher:string}>("SELECT refresh_token_cipher FROM social_connections WHERE user_id=$1 AND provider='youtube'",[userId]);
 if(!connection)throw new ApiError('YOUTUBE_CONNECTION_REQUIRED',403);
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID!,client_secret:process.env.GOOGLE_CLIENT_SECRET!,refresh_token:decrypt(connection.refresh_token_cipher),grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new ApiError('YOUTUBE_RECONNECT_REQUIRED',409);
 const data=await response.json();if(!data.access_token)throw new ApiError('YOUTUBE_RECONNECT_REQUIRED',409);return data.access_token as string;
}
export function youtubeUploadUrl(value:string){const url=new URL(value);if(url.protocol!=='https:'||url.hostname!=='www.googleapis.com'||!url.pathname.startsWith('/upload/youtube/v3/videos'))throw new ApiError('YOUTUBE_UPLOAD_HOST_INVALID',502);return url.toString();}
