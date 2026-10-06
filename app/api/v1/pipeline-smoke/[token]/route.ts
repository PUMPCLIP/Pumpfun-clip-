import {createHash,randomUUID} from 'node:crypto';
import {getMedia} from '@/lib/storage';
import {one} from '@/lib/db';
import {ApiError,jsonError} from '@/lib/auth';

export const runtime='nodejs';

/** Temporary, unguessable link minted only by the Render pipeline smoke runner. */
export async function GET(request:Request,{params}:{params:Promise<{token:string}>}){
  try{
    const {token}=await params;
    if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new ApiError('NOT_FOUND',404);
    const tokenHash=createHash('sha256').update(token).digest('hex');
    const link=await one<{output_asset_id:string|null}>(`SELECT output_asset_id FROM ai_clip_requests
      WHERE status='succeeded' AND output_asset_id IS NOT NULL
        AND output->>'shareTokenHash'=$1
        AND (output->>'shareExpiresAt')::timestamptz>now()
      LIMIT 1`,[tokenHash]);
    if(!link?.output_asset_id)throw new ApiError('NOT_FOUND',404);
    const asset=await one<{id:string;object_key:string;mime:string;status:string}>(`SELECT id,object_key,mime,status
      FROM media_assets WHERE id=$1 AND kind='clip' AND status='verified'`,[link.output_asset_id]);
    if(!asset)throw new ApiError('NOT_FOUND',404);
    const range=request.headers.get('range')||undefined;
    let result;
    try{result=await getMedia(asset.object_key,range);}catch(error){if(range)return new Response(null,{status:416});throw error;}
    const download=new URL(request.url).searchParams.get('download')==='1';
    const headers:Record<string,string>={
      'content-type':asset.mime,
      'content-disposition':`${download?'attachment':'inline'}; filename="pumpclip-test-${asset.id}.mp4"`,
      'cache-control':'private, no-store',
      'content-security-policy':"default-src 'none'",
      'x-content-type-options':'nosniff',
      'referrer-policy':'no-referrer',
      'accept-ranges':'bytes',
      'content-length':String(result.bytes.length),
    };
    if(range&&result.contentRange)headers['content-range']=result.contentRange;
    return new Response(result.bytes,{status:range?206:200,headers});
  }catch(error){return jsonError(error,randomUUID());}
}
