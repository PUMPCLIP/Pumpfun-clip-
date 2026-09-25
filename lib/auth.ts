import crypto from 'node:crypto';
import {cookies,headers} from 'next/headers';
import {one,db} from './db';
import {config} from './config';
export const hash=(s:string)=>crypto.createHash('sha256').update(s).digest('hex');
export const random=()=>crypto.randomBytes(32).toString('base64url');
export class ApiError extends Error { constructor(public code:string, public status=400, message?:string){super(message || code.replaceAll('_',' ').toLowerCase());} }
export async function session() {
  const token=(await cookies()).get('pc_session')?.value;
  if (!token) return null;
  return one<{id:string,user_id:string,email:string,display_name:string,roles:string[],is_admin:boolean,csrf_hash:string}>(
    'SELECT s.id,s.user_id,u.email,u.display_name,u.roles,u.is_admin,s.csrf_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()', [hash(token)]);
}
export async function requireUser() {const s=await session(); if(!s) throw new ApiError('SIGN_IN_REQUIRED',401); return s;}
export async function mutation(request:Request) {
  const s=await requireUser(); const origin=request.headers.get('origin');
  if(origin !== config.appUrl) throw new ApiError('INVALID_ORIGIN',403);
  const csrf=request.headers.get('x-csrf-token') || '';
  if(!csrf || hash(csrf)!==s.csrf_hash) throw new ApiError('INVALID_CSRF',403);
  return s;
}
export async function createSession(userId:string) {
  const token=random(), csrf=random();
  await db.query('INSERT INTO sessions(user_id,token_hash,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval \'7 days\')',[userId,hash(token),hash(csrf)]);
  (await cookies()).set('pc_session',token,{httpOnly:true,secure:config.appUrl.startsWith('https:'),sameSite:'lax',path:'/',maxAge:604800});
  (await cookies()).set('pc_csrf',csrf,{httpOnly:false,secure:config.appUrl.startsWith('https:'),sameSite:'strict',path:'/',maxAge:604800});
  return csrf;
}
export async function revokeSession() {
  const s=await session(); if(s) await db.query('UPDATE sessions SET revoked_at=now() WHERE id=$1',[s.id]);
  (await cookies()).delete('pc_session');
  (await cookies()).delete('pc_csrf');
}
export function jsonError(e:unknown,requestId:string) {
  const known=e instanceof ApiError ? e : null;
  if(!known) console.error(requestId,e);
  return Response.json({code:known?.code || 'INTERNAL_ERROR',message:known?.message || 'Unexpected server error',details:null,requestId},{status:known?.status || 500});
}
export async function assertOrigin(request:Request) {
  const h=await headers();
  if(request.headers.get('origin')!==config.appUrl || h.get('host')!==new URL(config.appUrl).host) throw new ApiError('INVALID_ORIGIN',403);
}
