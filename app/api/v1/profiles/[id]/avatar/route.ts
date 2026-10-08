import crypto from 'node:crypto';
import {one} from '@/lib/db';
import {ApiError,jsonError,session} from '@/lib/auth';
import {getMedia} from '@/lib/storage';

export const runtime='nodejs';

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;
    const profile=await one<{avatar_key:string|null;public_handle:string|null}>('SELECT avatar_key,public_handle FROM users WHERE id=$1 AND deleted_at IS NULL',[id]);
    if(!profile?.avatar_key)throw new ApiError('NOT_FOUND',404);
    const viewer=await session();
    if(!profile.public_handle&&viewer?.user_id!==id)throw new ApiError('NOT_FOUND',404);
    const media=await getMedia(profile.avatar_key);
    return new Response(media.bytes,{headers:{
      'content-type':'image/webp','content-length':String(media.bytes.length),
      'cache-control':profile.public_handle?'public, max-age=300, stale-while-revalidate=600':'private, no-store',
      'x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox",
      'cross-origin-resource-policy':'same-site',
    }});
  }catch(error){return jsonError(error,crypto.randomUUID());}
}
