import {mkdir,writeFile,unlink} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import {db,one,audit} from '@/lib/db';
import {mutation,ApiError,jsonError} from '@/lib/auth';
import {config} from '@/lib/config';
import {gate} from '@/lib/access';
export const runtime='nodejs';
const storage=path.resolve(process.cwd(),'data/private');
function probe(file:string):Promise<{streams:{codec_type:string}[],format:{duration:string}}> {
  return new Promise((resolve,reject)=>{
    const proc=spawn('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type','-of','json',file],{stdio:['ignore','pipe','pipe']});
    let output='',error=''; proc.stdout.on('data',d=>output+=d); proc.stderr.on('data',d=>error+=d);
    proc.on('close',code=>{try {if(code) throw new Error(error); resolve(JSON.parse(output));} catch(e){reject(e);}});
  });
}
export async function POST(request:Request) {
  const id=crypto.randomUUID();
  try {
    const user=await mutation(request);
    if(!user.roles.includes('streamer') && !user.roles.includes('clipper')) throw new ApiError('ROLE_REQUIRED',403);
    const size=Number(request.headers.get('content-length') || 0);
    if(size>150_000_000) throw new ApiError('FILE_TOO_LARGE',413);
    const form=await request.formData(), file=form.get('file');
    if(!(file instanceof File) || file.size>150_000_000 || file.size===0 || !['video/mp4','video/quicktime','video/webm'].includes(file.type)) throw new ApiError('INVALID_MEDIA',422);
    const kind=form.get('kind');
    if(kind!=='source' && kind!=='clip') throw new ApiError('INVALID_MEDIA_KIND');
    if(kind==='source' && (form.get('rightsDeclared')!=='true' || !user.roles.includes('streamer'))) throw new ApiError('SOURCE_RIGHTS_REQUIRED',422);
    await gate(user.user_id,kind==='source'?'streamer':'clipper');
    await mkdir(storage,{recursive:true});
    const key=crypto.randomUUID()+'.bin', location=path.join(storage,key), bytes=Buffer.from(await file.arrayBuffer());
    await writeFile(location,bytes,{flag:'wx',mode:0o600});
    try {
      const meta=await probe(location);
      if(!meta.streams?.some(s=>s.codec_type==='video') || !meta.streams?.some(s=>s.codec_type==='audio') ||
        !Number.isFinite(Number(meta.format.duration)) || Number(meta.format.duration)<=0 || Number(meta.format.duration)>14400) throw new ApiError('INVALID_MEDIA',422);
      const sha=crypto.createHash('sha256').update(bytes).digest('hex');
      const asset=await one<any>(`INSERT INTO media_assets(owner_id,kind,object_key,sha256,mime,byte_size,rights_declared_at,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,'verified') RETURNING id,kind,sha256,mime,byte_size,status`,
        [user.user_id,kind,key,sha,file.type,file.size,kind==='source'?new Date():null]);
      await audit(db,user.user_id,'media.uploaded','media_asset',asset.id,{kind,sha256:sha});
      return Response.json(asset,{status:201});
    } catch(e) {await unlink(location); throw e;}
  } catch(e) {return jsonError(e,id);}
}
