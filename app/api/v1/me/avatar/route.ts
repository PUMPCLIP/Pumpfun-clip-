import Busboy from 'busboy';
import crypto from 'node:crypto';
import {Readable} from 'node:stream';
import sharp from 'sharp';
import {db,one,tx} from '@/lib/db';
import {ApiError,jsonError,mutation} from '@/lib/auth';
import {rateLimit} from '@/lib/rate-limit';
import {putMedia,removeMedia} from '@/lib/storage';

export const runtime='nodejs';
const MAX_AVATAR_BYTES=5*1024*1024;
const ACCEPTED_MIME=new Set(['image/jpeg','image/png','image/webp']);

async function parseAvatar(request:Request):Promise<Buffer>{
  const contentType=request.headers.get('content-type')||'';
  if(!/^multipart\/form-data\s*;/i.test(contentType)||!request.body)throw new ApiError('INVALID_AVATAR',422,'Choose a JPEG, PNG, or WebP image.');
  const length=Number(request.headers.get('content-length')||0);
  if(Number.isFinite(length)&&length>MAX_AVATAR_BYTES+64_000)throw new ApiError('FILE_TOO_LARGE',413,'Avatar files must be 5 MB or smaller.');
  return new Promise<Buffer>((resolve,reject)=>{
    let parseError:unknown=null,seen=false,bytes=Buffer.alloc(0);
    const parser=Busboy({headers:{'content-type':contentType},limits:{files:1,fields:0,fileSize:MAX_AVATAR_BYTES}});
    parser.on('file',(name,stream,info)=>{
      if(name!=='avatar'||seen){parseError=new ApiError('INVALID_AVATAR',422,'Upload one image using the avatar field.');stream.resume();return;}
      seen=true;
      if(!ACCEPTED_MIME.has(info.mimeType)){parseError=new ApiError('INVALID_AVATAR',422,'Choose a JPEG, PNG, or WebP image.');stream.resume();return;}
      const chunks:Buffer[]=[];
      stream.on('data',(chunk:Buffer)=>chunks.push(Buffer.from(chunk)));
      stream.on('limit',()=>{parseError=new ApiError('FILE_TOO_LARGE',413,'Avatar files must be 5 MB or smaller.');});
      stream.on('end',()=>{bytes=Buffer.concat(chunks);});
    });
    parser.on('filesLimit',()=>{parseError=new ApiError('INVALID_AVATAR',422,'Upload one image at a time.');});
    parser.on('fieldsLimit',()=>{parseError=new ApiError('INVALID_AVATAR',422);});
    parser.on('error',error=>{parseError=error;});
    parser.on('close',async()=>{
      if(parseError){reject(parseError);return;}
      if(!seen||!bytes.length){reject(new ApiError('INVALID_AVATAR',422,'Choose an image to upload.'));return;}
      try{
        const metadata=await sharp(bytes,{failOn:'error',limitInputPixels:16_000_000}).metadata();
        if(!metadata.width||!metadata.height||!['jpeg','png','webp'].includes(metadata.format||''))throw new Error('unsupported image');
        const normalized=await sharp(bytes,{failOn:'error',limitInputPixels:16_000_000})
          .rotate().resize(512,512,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}})
          .webp({quality:85}).toBuffer();
        resolve(normalized);
      }catch{reject(new ApiError('INVALID_AVATAR',422,'That image could not be decoded. Choose a valid JPEG, PNG, or WebP file.'));}
    });
    try{Readable.fromWeb(request.body as import('node:stream/web').ReadableStream).pipe(parser);}
    catch(error){reject(error);}
  });
}

export async function POST(request:Request){
  const requestId=crypto.randomUUID();let key='';
  try{
    const user=await mutation(request);
    await rateLimit(user.user_id,'profile-avatar',8,3600);
    const image=await parseAvatar(request);
    key=`avatars/${user.user_id}/${crypto.randomUUID()}.webp`;
    await putMedia(key,image,'image/webp');
    const oldKey=await tx(async client=>{
      const current=await one<{avatar_key:string|null}>('SELECT avatar_key FROM users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[user.user_id],client);
      if(!current)throw new ApiError('NOT_FOUND',404);
      await client.query('UPDATE users SET avatar_key=$2,avatar_updated_at=now(),updated_at=now() WHERE id=$1',[user.user_id,key]);
      return current.avatar_key;
    });
    if(oldKey)await removeMedia(oldKey).catch(error=>console.error('Previous avatar cleanup failed',error));
    return Response.json({avatarUrl:`/api/v1/profiles/${user.user_id}/avatar?v=${Date.now()}`},{status:201});
  }catch(error){if(key)await removeMedia(key).catch(()=>{});return jsonError(error,requestId);}
}

export async function DELETE(request:Request){
  const requestId=crypto.randomUUID();
  try{
    const user=await mutation(request);
    const oldKey=await tx(async client=>{
      const current=await one<{avatar_key:string|null}>('SELECT avatar_key FROM users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[user.user_id],client);
      if(!current)throw new ApiError('NOT_FOUND',404);
      await client.query('UPDATE users SET avatar_key=NULL,avatar_updated_at=NULL,updated_at=now() WHERE id=$1',[user.user_id]);
      return current.avatar_key;
    });
    if(oldKey)await removeMedia(oldKey).catch(error=>console.error('Avatar cleanup failed',error));
    return Response.json({ok:true});
  }catch(error){return jsonError(error,requestId);}
}
