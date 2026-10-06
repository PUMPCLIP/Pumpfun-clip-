import pg from 'pg';
const databaseUrl=process.env.DATABASE_URL||'';
const ssl=process.env.DATABASE_SSL==='disable'?undefined:(databaseUrl?{rejectUnauthorized:false}:undefined);
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {S3Client,GetObjectCommand,PutObjectCommand} from '@aws-sdk/client-s3';
import {mediaRoot,localMediaPath} from './media-root.mjs';

const client=new pg.Client({connectionString:databaseUrl,ssl});
const storage=mediaRoot;
const LEASE_MS=Number(process.env.WORKER_LEASE_MS||15*60*1000);
const media=process.env.MEDIA_BUCKET?new S3Client({region:process.env.MEDIA_REGION||'auto',endpoint:process.env.MEDIA_ENDPOINT||undefined,forcePathStyle:!!process.env.MEDIA_ENDPOINT,credentials:process.env.MEDIA_ACCESS_KEY_ID&&process.env.MEDIA_SECRET_ACCESS_KEY?{accessKeyId:process.env.MEDIA_ACCESS_KEY_ID,secretAccessKey:process.env.MEDIA_SECRET_ACCESS_KEY}:undefined}):null;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let activeProcess=null,stopping=false;
const keySafe=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,240}$/.test(value)&&!value.split('/').includes('..');

async function sourceFile(key){
  if(!keySafe(key))throw new Error('Invalid media object key');
  if(!media)return localMediaPath(key);
  const result=await media.send(new GetObjectCommand({Bucket:process.env.MEDIA_BUCKET,Key:key}));
  const temp=path.join(storage,crypto.randomUUID()+'.source');
  await mkdir(storage,{recursive:true});
  await writeFile(temp,Buffer.from(await result.Body.transformToByteArray()),{mode:0o600});
  return temp;
}
async function render(input,output,start,duration,caption,captionStyle='classic'){
  let subtitleFilter='';
  if(caption.trim()){
    const subtitle=output+'.srt';
    const clean=caption.replace(/[\r\n<>]/g,' ').slice(0,200);
    const timestamp=seconds=>{const ms=Math.floor(seconds*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};
    await writeFile(subtitle,`1\n00:00:00,000 --> ${timestamp(duration)}\n${clean}\n`);
    const styles={classic:'',bold:':force_style=FontSize=25\\,Outline=3\\,Shadow=1\\,Alignment=2\\,MarginV=140',signal:':force_style=FontSize=25\\,PrimaryColour=&H0000EFFF\\,Outline=3\\,Shadow=1\\,Alignment=2\\,MarginV=140'};
    subtitleFilter=`,subtitles=${subtitle}${styles[captionStyle]||''}`;
  }
  return new Promise((resolve,reject)=>{
    const args=['-hide_banner','-loglevel','error','-y','-ss',String(start),'-i',input,'-t',String(duration),'-vf','scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1'+subtitleFilter,'-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',output];
    const proc=spawn('ffmpeg',args,{stdio:['ignore','ignore','pipe']});activeProcess=proc;let error='';
    proc.stderr.on('data',d=>error+=d.toString().slice(0,1000));
    const finish=(fn)=>{if(activeProcess===proc)activeProcess=null;fn();};
    proc.on('error',err=>finish(()=>reject(err)));
    proc.on('close',code=>finish(()=>code===0?resolve():reject(new Error(error||`FFmpeg exited ${code}`))));
  });
}
async function recoverStale(){
  await client.query("UPDATE studio_jobs SET status='queued',lease_id=NULL,lease_expires_at=NULL,updated_at=now() WHERE status='processing' AND lease_expires_at IS NOT NULL AND lease_expires_at<now()");
}
async function claim(){
  await client.query('BEGIN');
  try{
    await recoverStale();
    const leaseId=crypto.randomUUID();
    const found=await client.query(`SELECT j.*,a.object_key FROM studio_jobs j JOIN studio_projects p ON p.id=j.project_id JOIN media_assets a ON a.id=p.source_asset_id WHERE j.status='queued' ORDER BY j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1`);
    const job=found.rows[0];
    if(!job){await client.query('COMMIT');return null;}
    await client.query("UPDATE studio_jobs SET status='processing',lease_id=$2,lease_expires_at=now()+($3::text||' milliseconds')::interval,updated_at=now() WHERE id=$1",[job.id,leaseId,LEASE_MS]);
    await client.query('COMMIT');return {...job,lease_id:leaseId};
  }catch(error){await client.query('ROLLBACK');throw error;}
}
async function fail(job,error){
  await client.query("UPDATE studio_jobs SET status='failed',error_message=$3,lease_id=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=$1 AND lease_id=$2 AND status='processing'",[job.id,job.lease_id,String(error).slice(0,1000)]);
}
async function tick(){
  const job=await claim();if(!job)return false;
  const key=crypto.randomUUID()+'.mp4',output=path.join(storage,key);let source;
  try{
    await mkdir(storage,{recursive:true});
    source=await sourceFile(job.object_key);
    await render(source,output,Number(job.start_seconds),Number(job.end_seconds)-Number(job.start_seconds),job.caption,job.caption_style);
    const bytes=await readFile(output),sha=crypto.createHash('sha256').update(bytes).digest('hex');
    if(bytes.length>250*1024*1024)throw new Error('Rendered clip exceeds the 250 MiB output limit');
    if(media)await media.send(new PutObjectCommand({Bucket:process.env.MEDIA_BUCKET,Key:key,Body:bytes,ContentType:'video/mp4',ServerSideEncryption:process.env.MEDIA_SSE==='AES256'?'AES256':undefined}));
    await client.query('BEGIN');
    const asset=await client.query(`INSERT INTO media_assets(owner_id,kind,object_key,sha256,mime,byte_size,status) VALUES($1,'clip',$2,$3,'video/mp4',$4,'verified') RETURNING id`,[job.owner_id,key,sha,bytes.length]);
    const updated=await client.query("UPDATE studio_jobs SET status='succeeded',output_asset_id=$2,lease_id=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=$1 AND lease_id=$3 AND status='processing'",[job.id,asset.rows[0].id,job.lease_id]);
    if(!updated.rowCount){await client.query('ROLLBACK');throw new Error('STALE_WORKER_LEASE');}
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK').catch(()=>{});await fail(job,error).catch(()=>{});console.error('Job failed',job.id,error);
  }finally{if(source&&media)await unlink(source).catch(()=>{});await unlink(output).catch(()=>{});await unlink(output+'.srt').catch(()=>{});}
  return true;
}
function shutdown(){stopping=true;if(activeProcess){try{activeProcess.kill('SIGTERM');}catch{}}}
await client.connect();
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
await recoverStale();
console.log('PUMPCLIP studio worker started');
while(!stopping){try{if(!await tick())await pause(2000);}catch(error){console.error(error);await pause(5000);}}
await client.end();
