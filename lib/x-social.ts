import crypto from 'node:crypto';
import {one,db} from './db';
import {decrypt,encrypt} from './social';
import {ApiError} from './auth';
import {config} from './config';

export const xConfigured=()=>!!(process.env.X_CLIENT_ID&&process.env.X_CLIENT_SECRET&&process.env.SOCIAL_TOKEN_KEY);
export const xRedirect=()=>config.appUrl+'/api/v1/social/x/callback';
const basic=()=> 'Basic '+Buffer.from(process.env.X_CLIENT_ID+':'+process.env.X_CLIENT_SECRET).toString('base64');
export const xChallenge=(verifier:string)=>crypto.createHash('sha256').update(verifier).digest('base64url');

export async function xTokenExchange(params:Record<string,string>){
 const response=await fetch('https://api.x.com/2/oauth2/token',{method:'POST',headers:{authorization:basic(),'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params),signal:AbortSignal.timeout(15000)});
 const data=await response.json();if(!response.ok||!data.access_token)throw new ApiError('X_TOKEN_EXCHANGE_FAILED',502);
 return data as {access_token:string;refresh_token?:string;expires_in:number;scope?:string};
}
export async function xAccessToken(userId:string){
 const row=await one<{refresh_token_cipher:string}>("SELECT refresh_token_cipher FROM social_connections WHERE user_id=$1 AND provider='x'",[userId]);
 if(!row)throw new ApiError('X_CONNECTION_REQUIRED',403);
 let saved:{access:string;refresh:string;expires:number;scope:string};
 try{saved=JSON.parse(decrypt(row.refresh_token_cipher));}catch{throw new ApiError('X_RECONNECT_REQUIRED',409);}
 if(!saved.scope.includes('tweet.write')||!saved.scope.includes('media.write'))throw new ApiError('X_RECONNECT_FOR_MEDIA_PERMISSION',409);
 if(Date.now()<saved.expires-60000)return saved.access;
 if(!saved.refresh)throw new ApiError('X_RECONNECT_REQUIRED',409);
 const refreshed=await xTokenExchange({grant_type:'refresh_token',refresh_token:saved.refresh,client_id:process.env.X_CLIENT_ID!});
 const next={access:refreshed.access_token,refresh:refreshed.refresh_token||saved.refresh,expires:Date.now()+refreshed.expires_in*1000,scope:refreshed.scope||saved.scope};
 await db.query("UPDATE social_connections SET refresh_token_cipher=$3,updated_at=now() WHERE user_id=$1 AND provider=$2",[userId,'x',encrypt(JSON.stringify(next))]);
 return next.access;
}

export async function xApi(url:string,token:string,options:RequestInit={}){
 const response=await fetch(url,{...options,headers:{authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(120000)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok||data.errors?.length)throw new ApiError('X_PROVIDER_REQUEST_FAILED',502);
 return data;
}
