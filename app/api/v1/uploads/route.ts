import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,stat,unlink} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import Busboy from 'busboy';
import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import {db,one,audit,tx} from '@/lib/db';
import {mutation,ApiError,jsonError} from '@/lib/auth';
import {gate} from '@/lib/access';
import {rateLimit} from '@/lib/rate-limit';
import {putMediaFile,removeMedia} from '@/lib/storage';
import {mediaRoot} from '@/lib/media-root';
export const runtime='nodejs';
const storage=mediaRoot;
const MAX_UPLOAD_BYTES=150_000_000;
type UploadKind='source'|'clip';
type ParsedUpload={location:string;key:string;mime:string;size:number;kind:UploadKind;rightsDeclared:boolean};

function probe(file:string):Promise<{streams:{codec_type:string}[];format:{duration:string}}> {
  return new Promise((resolve,reject)=>{
    const proc=spawn('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type','-of','json',file],{stdio:['ignore','pipe','pipe']});
    let output='',error=''; proc.stdout.on('data',d=>output+=d); proc.stderr.on('data',d=>error+=d);
    proc.on('error',reject);
    proc.on('close',code=>{try {if(code) throw new Error(error); resolve(JSON.parse(output));} catch(e){reject(e);}});
  });
}

async function parseUpload(request:Request):Promise<ParsedUpload>{
  const contentType=request.headers.get('content-type')||'';
  if(!/^multipart\/form-data\s*;/i.test(contentType))throw new ApiError('INVALID_MEDIA',422);
  if(!request.body)throw new ApiError('INVALID_MEDIA',422);
  await mkdir(storage,{recursive:true,mode:0o700});
  let location='';
  try{
    return await new Promise<ParsedUpload>((resolve,reject)=>{
      const parser=Busboy({headers:{'content-type':contentType},limits:{files:1,fields:3,fieldSize:4096,fileSize:MAX_UPLOAD_BYTES}});
      let key='',mime='',kind='',rightsDeclared=false,truncated=false,parseError:unknown=null;
      let uploadTask:Promise<void>|null=null;
      parser.on('field',(name,value)=>{if(name==='kind')kind=value;else if(name==='rightsDeclared')rightsDeclared=value==='true';});
      parser.on('file',(name,stream,info)=>{
        if(name!=='file'||uploadTask){parseError=new ApiError('INVALID_MEDIA',422);stream.resume();return;}
        if(!['video/mp4','video/quicktime','video/webm'].includes(info.mimeType))parseError=new ApiError('INVALID_MEDIA',422);
        key=crypto.randomUUID()+'.bin';location=path.join(storage,key);mime=info.mimeType;
        stream.on('limit',()=>{truncated=true;});
        uploadTask=pipeline(stream,createWriteStream(location,{flags:'wx',mode:0o600}));
        uploadTask.catch(error=>{parseError=error;});
      });
      parser.on('filesLimit',()=>{parseError=new ApiError('INVALID_MEDIA',422);});
      parser.on('fieldsLimit',()=>{parseError=new ApiError('INVALID_MEDIA',422);});
      parser.on('error',error=>{parseError=error;});
      parser.on('close',async()=>{
        try{
          if(parseError)throw parseError;
          if(!uploadTask||!location)throw new ApiError('INVALID_MEDIA',422);
          await uploadTask;
          const size=(await stat(location)).size;
          if(truncated||!size||size>MAX_UPLOAD_BYTES)throw new ApiError('FILE_TOO_LARGE',413);
          if(kind!=='source'&&kind!=='clip')throw new ApiError('INVALID_MEDIA_KIND');
          resolve({location,key,mime,size,kind,rightsDeclared});
        }catch(error){reject(error);}
      });
      try{
        const body=Readable.fromWeb(request.body as import('node:stream/web').ReadableStream);
        body.on('error',error=>{parseError=error;parser.destroy(error);});
        body.pipe(parser);
      }catch(error){parser.destroy(error as Error);}
    });
  }catch(error){if(location)await unlink(location).catch(()=>{});throw error;}
}

async function sha256File(file:string):Promise<string>{
  const digest=crypto.createHash('sha256');
  for await(const chunk of createReadStream(file))digest.update(chunk);
  return digest.digest('hex');
}

export async function POST(request:Request){
  const requestId=crypto.randomUUID();
  let upload:ParsedUpload|undefined,stored=false,registered=false;
  try{
    const user=await mutation(request);
    if(!user.roles.includes('streamer')&&!user.roles.includes('clipper'))throw new ApiError('ROLE_REQUIRED',403);
    const requestSize=Number(request.headers.get('content-length')||0);
    if(Number.isFinite(requestSize)&&requestSize>MAX_UPLOAD_BYTES+1_000_000)throw new ApiError('FILE_TOO_LARGE',413);
    await rateLimit(user.user_id,'media-upload',12,3600);
    upload=await parseUpload(request);
    if(upload.kind==='source'){
      if(upload.rightsDeclared!==true)throw new ApiError('SOURCE_RIGHTS_REQUIRED',422);
      const accessRole=user.roles.includes('streamer')?'streamer':'clipper';
      await gate(user.user_id,accessRole);
    }
    const meta=await probe(upload.location);
    if(!meta.streams?.some(stream=>stream.codec_type==='video')||!Number.isFinite(Number(meta.format?.duration))||Number(meta.format.duration)<=0||Number(meta.format.duration)>14400)throw new ApiError('INVALID_MEDIA',422);
    const sha=await sha256File(upload.location);
    if(process.env.MEDIA_BUCKET){
      await putMediaFile(upload.key,upload.location,upload.mime,upload.size);
      stored=true;
      await unlink(upload.location);
    }else stored=true;
    const asset=await tx(async client=>{
      const row=await one<{id:string;kind:string;sha256:string;mime:string;byte_size:number;status:string}>(`INSERT INTO media_assets(owner_id,kind,object_key,sha256,mime,byte_size,rights_declared_at,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,'verified') RETURNING id,kind,sha256,mime,byte_size,status`,
        [user.user_id,upload!.kind,upload!.key,sha,upload!.mime,upload!.size,upload!.kind==='source'?new Date():null],client);
      if(!row)throw new Error('Media registration failed');
      await audit(client,user.user_id,'media.uploaded','media_asset',row.id,{kind:upload!.kind,sha256:sha});
      return row;
    });
    registered=true;
    return Response.json(asset,{status:201});
  }catch(error){
    if(upload&&!registered){
      if(process.env.MEDIA_BUCKET){if(stored)await removeMedia(upload.key).catch(()=>{});await unlink(upload.location).catch(()=>{});}
      else await unlink(upload.location).catch(()=>{});
    }
    return jsonError(error,requestId);
  }
}
