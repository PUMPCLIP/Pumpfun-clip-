import pg from 'pg';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir,unlink,stat,copyFile,chmod,readdir,rm} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {S3Client,GetObjectCommand,PutObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';

const db=new pg.Client({connectionString:process.env.DATABASE_URL});
const root=path.resolve(process.env.VIDEO_WORKDIR||'data/private/native-clips');
const python=process.env.PUMPCLIP_PYTHON||'python3';
const engine=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../engine/video.py');
const bucket=process.env.MEDIA_BUCKET;
const media=bucket?new S3Client({region:process.env.MEDIA_REGION||'auto',endpoint:process.env.MEDIA_ENDPOINT||undefined,forcePathStyle:!!process.env.MEDIA_ENDPOINT,credentials:process.env.MEDIA_ACCESS_KEY_ID&&process.env.MEDIA_SECRET_ACCESS_KEY?{accessKeyId:process.env.MEDIA_ACCESS_KEY_ID,secretAccessKey:process.env.MEDIA_SECRET_ACCESS_KEY}:undefined}):null;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const keySafe=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,240}$/.test(value)&&!value.split('/').includes('..');
let activeProcess=null;

async function objectToFile(key,target){
  if(!keySafe(key))throw new Error('Invalid media object key');
  if(!media){const source=path.resolve('data/private',key);const rootLocal=path.resolve('data/private')+path.sep;if(!source.startsWith(rootLocal))throw new Error('Invalid local media path');return source;}
  const result=await media.send(new GetObjectCommand({Bucket:bucket,Key:key}));
  if(Number(result.ContentLength||0)>512*1024*1024)throw new Error('Source video exceeds the 512 MiB processing limit');
  try{
   await pipeline(result.Body,createWriteStream(target,{flags:'wx',mode:0o600}));
   const size=(await stat(target)).size;
   if(!size||size>512*1024*1024)throw new Error('Source video exceeds the 512 MiB processing limit');
   return target;
  }catch(error){await unlink(target).catch(()=>{});throw error;}
}

function invoke(args,{timeout=4*60*60*1000,maxBytes=64*1024}={}){
 return new Promise((resolve,reject)=>{
  const proc=spawn(python,[engine,...args],{stdio:['ignore','pipe','pipe'],detached:true,env:{...process.env,PYTHONUNBUFFERED:'1',PYTHONDONTWRITEBYTECODE:'1'}});
  activeProcess=proc;
  let stdout='',stderr='';
  const killGroup=signal=>{try{process.kill(-proc.pid,signal);}catch{proc.kill(signal);}};
  const timer=setTimeout(()=>killGroup('SIGKILL'),timeout);
  proc.stdout.on('data',data=>{stdout=(stdout+data.toString()).slice(-maxBytes);});
  proc.stderr.on('data',data=>{stderr=(stderr+data.toString()).slice(-maxBytes);});
  proc.on('error',err=>{clearTimeout(timer);if(activeProcess===proc)activeProcess=null;reject(err);});
  proc.on('close',code=>{clearTimeout(timer);if(activeProcess===proc)activeProcess=null;if(code===0){try{resolve(JSON.parse(stdout));}catch{reject(new Error('Video engine returned invalid output'));}}else reject(new Error((stderr||stdout||`Video engine exited ${code}`).slice(-4000)));});
 });
}

async function claim(){
 await db.query('BEGIN');
 try{
  const found=await db.query(`SELECT r.*,a.object_key AS asset_object_key FROM ai_clip_requests r
   LEFT JOIN media_assets a ON a.id=r.source_asset_id
   WHERE r.status='queued' AND r.engine='native' ORDER BY r.created_at
   LIMIT 1 FOR UPDATE OF r SKIP LOCKED`);
  const job=found.rows[0];
  if(job)await db.query("UPDATE ai_clip_requests SET status='processing',worker_started_at=now(),updated_at=now() WHERE id=$1",[job.id]);
  await db.query('COMMIT');return job;
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}

async function failJob(job,message){
 await db.query('BEGIN');
 try{
  await db.query("UPDATE ai_clip_requests SET status='failed',error_message=$2,updated_at=now() WHERE id=$1",[job.id,message]);
  if(job.usage_ledger_id){
   const ledger=(await db.query('SELECT * FROM ai_usage_ledger WHERE id=$1 FOR UPDATE',[job.usage_ledger_id])).rows[0];
   if(ledger?.status==='reserved'){
    const metadata=ledger.metadata||{};
    await db.query('UPDATE ai_usage_accounts SET free_units=free_units+$2,balance_units=balance_units+$3,updated_at=now() WHERE user_id=$1',[ledger.user_id,Number(metadata.freeUnits||0),Number(metadata.paidUnits||0)]);
    await db.query("UPDATE ai_usage_ledger SET status='released' WHERE id=$1",[job.usage_ledger_id]);
   }
  }
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}

async function persistOutput(job,outputPath,rendered){
 const fileStats=await stat(outputPath);
 if(!fileStats.size||fileStats.size>250*1024*1024)throw new Error('Rendered clip exceeds the 250 MiB output limit');
 const objectKey=`native/${job.user_id}/${crypto.randomUUID()}.mp4`;
 const hash=crypto.createHash('sha256');
 const digest=await new Promise((resolve,reject)=>{const stream=createReadStream(outputPath);stream.on('data',chunk=>hash.update(chunk));stream.on('error',reject);stream.on('end',()=>resolve(hash.digest('hex')));});
 if(media)await media.send(new PutObjectCommand({Bucket:bucket,Key:objectKey,Body:createReadStream(outputPath),ContentLength:fileStats.size,ContentType:'video/mp4',ServerSideEncryption:process.env.MEDIA_SSE==='AES256'?'AES256':undefined}));
 else{const target=path.resolve('data/private',objectKey);const localRoot=path.resolve('data/private')+path.sep;if(!target.startsWith(localRoot))throw new Error('Invalid output key');await mkdir(path.dirname(target),{recursive:true,mode:0o700});await copyFile(outputPath,target);await chmod(target,0o600);}
 try{
  await db.query('BEGIN');
  const asset=await db.query(`INSERT INTO media_assets(owner_id,kind,object_key,sha256,mime,byte_size,status)
   VALUES($1,'clip',$2,$3,'video/mp4',$4,'verified') RETURNING id`,[job.user_id,objectKey,digest,fileStats.size]);
  await db.query("UPDATE ai_clip_requests SET status='succeeded',output_asset_id=$2,output=$3,error_message=NULL,updated_at=now() WHERE id=$1",[job.id,asset.rows[0].id,JSON.stringify({duration:rendered.duration,aspectRatio:job.aspect_ratio,assetId:asset.rows[0].id})]);
  const ledger=(await db.query("SELECT * FROM ai_usage_ledger WHERE id=$1 FOR UPDATE",[job.usage_ledger_id])).rows[0];
  if(ledger?.status==='reserved'){
   await db.query("UPDATE ai_usage_accounts SET consumed_units=consumed_units+$2,updated_at=now() WHERE user_id=$1",[ledger.user_id,ledger.units]);
   await db.query("UPDATE ai_usage_ledger SET status='consumed' WHERE id=$1",[job.usage_ledger_id]);
  }
  await db.query('COMMIT');
  return asset.rows[0].id;
 }catch(error){await db.query('ROLLBACK').catch(()=>{});if(media)await media.send(new DeleteObjectCommand({Bucket:bucket,Key:objectKey})).catch(()=>{});else await unlink(path.resolve('data/private',objectKey)).catch(()=>{});throw error;}
}

async function processJob(job){
 const dir=path.join(root,job.id);
 let input=path.join(dir,'source.bin'),output=path.join(dir,'clip.mp4');
 try{
  await mkdir(root,{recursive:true,mode:0o700});
  await (await import('node:fs/promises')).rm(dir,{recursive:true,force:true});
  await mkdir(dir,{recursive:true,mode:0o700});
  if(job.source_url){
   const downloaded=await invoke(['download','--url',job.source_url,'--output',input]);
   input=downloaded.path;
  }else input=await objectToFile(job.asset_object_key,input);
  const args=['render','--input',input,'--output',output,'--aspect-ratio',job.aspect_ratio||'9:16','--caption',job.caption||'','--caption-style',job.caption_style||'classic','--instructions',job.instructions||''];
  if(job.start_seconds!==null&&job.end_seconds!==null)args.push('--start',String(job.start_seconds),'--end',String(job.end_seconds));
  const rendered=await invoke(args);
  const fileStats=await stat(rendered.path);
  if(fileStats.size<1024)throw new Error('Rendered output is unexpectedly small');
  const assetId=await persistOutput(job,rendered.path,rendered);
  console.log(JSON.stringify({event:'native_clip_succeeded',jobId:job.id,assetId}));
 }catch(error){
  const message=String(error?.message||error).slice(0,1000);
  await failJob(job,message);
  console.error(JSON.stringify({event:'native_clip_failed',jobId:job.id,error:message}));
 }finally{
  // All downloaded and rendered intermediates are private, per-job, and always removed.
  await (await import('node:fs/promises')).rm(dir,{recursive:true,force:true}).catch(()=>{});
 }
}

await db.connect();
// Recover requests abandoned by a killed worker after a bounded processing lease.
await db.query("UPDATE ai_clip_requests SET status='queued',worker_started_at=NULL,updated_at=now() WHERE engine='native' AND status='processing' AND worker_started_at<now()-interval '12 hours'");
await mkdir(root,{recursive:true,mode:0o700});
const activeIds=new Set((await db.query("SELECT id FROM ai_clip_requests WHERE engine='native' AND status='processing'")).rows.map(row=>row.id));
for(const entry of await readdir(root,{withFileTypes:true}))if(entry.isDirectory()&&!activeIds.has(entry.name)&&/^[0-9a-f-]{36}$/i.test(entry.name))await rm(path.join(root,entry.name),{recursive:true,force:true});
console.log('PUMPCLIP native video worker started');
let stopping=false;
const shutdown=()=>{stopping=true;if(activeProcess){try{process.kill(-activeProcess.pid,'SIGTERM');}catch{activeProcess.kill('SIGTERM');}}};
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
while(!stopping){
 try{const job=await claim();if(job)await processJob(job);else await wait(2000);}
 catch(error){console.error('Native video worker error',error);await wait(5000);}
}
await db.end();
