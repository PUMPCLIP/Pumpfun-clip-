import pg from 'pg';
import {spawn} from 'node:child_process';
import {readFile,unlink} from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {S3Client,GetObjectCommand} from '@aws-sdk/client-s3';
const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
const media=process.env.MEDIA_BUCKET?new S3Client({region:process.env.MEDIA_REGION||'auto',endpoint:process.env.MEDIA_ENDPOINT||undefined,forcePathStyle:!!process.env.MEDIA_ENDPOINT,credentials:process.env.MEDIA_ACCESS_KEY_ID&&process.env.MEDIA_SECRET_ACCESS_KEY?{accessKeyId:process.env.MEDIA_ACCESS_KEY_ID,secretAccessKey:process.env.MEDIA_SECRET_ACCESS_KEY}:undefined}):null;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const run=(args)=>new Promise((resolve,reject)=>{const proc=spawn('ffmpeg',args,{stdio:['ignore','ignore','pipe']});let err='';proc.stderr.on('data',d=>err+=d.toString().slice(0,2000));proc.on('close',code=>code?reject(new Error(err)):resolve());});
const duration=file=>new Promise((resolve,reject)=>{const proc=spawn('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',file]);let data='';proc.stdout.on('data',d=>data+=d);proc.on('close',code=>code?reject(new Error('Cannot probe media')):resolve(Number(data)));});
function rank(segments){
 const candidates=[];
 for(let i=0;i<segments.length;i++){
  const start=segments[i].start;
  for(let j=i;j<segments.length&&segments[j].end-start<=90;j++){
   const length=segments[j].end-start;if(length<15)continue;
   const text=segments.slice(i,j+1).map(s=>s.text.trim()).join(' ');
   const signals=(text.match(/\b(but|however|secret|never|mistake|million|because|imagine|why|actually|first|lost|won|surpris|risk|lesson)\w*/gi)||[]).length;
   const score=signals*3+Math.min(8,text.length/120)-Math.abs(length-40)/15;
   candidates.push({start:Number(start.toFixed(2)),end:Number(segments[j].end.toFixed(2)),score:Number(score.toFixed(2)),hook:text.slice(0,180),excerpt:text.slice(0,500)});
  }
 }
 candidates.sort((a,b)=>b.score-a.score);
 const result=[];for(const item of candidates){if(result.every(c=>Math.max(c.start,item.start)>=Math.min(c.end,item.end)))result.push(item);if(result.length===8)break;}
 return result.sort((a,b)=>a.start-b.start);
}
async function processJob(job){
 if(!process.env.OPENAI_API_KEY)throw new Error('OPENAI_API_KEY missing');
 let source=path.resolve('data/private',job.object_key);const segments=[];
 if(media){const obj=await media.send(new GetObjectCommand({Bucket:process.env.MEDIA_BUCKET,Key:job.object_key}));source=path.join(os.tmpdir(),`pumpclip-source-${crypto.randomUUID()}`);await (await import('node:fs/promises')).writeFile(source,Buffer.from(await obj.Body.transformToByteArray()));}
 try {
 const seconds=await duration(source);
 if(!Number.isFinite(seconds)||seconds<=0||seconds>3600)throw new Error('AI transcription supports sources up to 60 minutes');
 // Keep API spend bounded: at most six 10-minute chunks per source.
 for(let offset=0;offset<seconds;offset+=600){
  const output=path.join(os.tmpdir(),`pumpclip-ai-${crypto.randomUUID()}.mp3`);
  try{
   await run(['-v','error','-ss',String(offset),'-i',source,'-t','600','-vn','-ac','1','-ar','16000','-b:a','48k','-y',output]);
   const bytes=await readFile(output);if(bytes.length<1000)break;if(bytes.length>=25_000_000)throw new Error('Audio chunk exceeds transcription limit');
   const form=new FormData();form.set('model','whisper-1');form.set('response_format','verbose_json');form.append('timestamp_granularities[]','segment');form.set('file',new File([bytes],'audio.mp3',{type:'audio/mpeg'}));
   const response=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:form,signal:AbortSignal.timeout(120000)});
   if(!response.ok)throw new Error(`Transcription provider returned ${response.status}`);
   const transcript=await response.json();if(!Array.isArray(transcript.segments))throw new Error('Transcription segments missing');
   segments.push(...transcript.segments.map(s=>({start:Number(s.start)+offset,end:Number(s.end)+offset,text:String(s.text||'')})));
   if(Number(transcript.duration)<599)break;
  }finally{await unlink(output).catch(()=>{});}
 }
 const suggestions=rank(segments);
 await db.query("UPDATE ai_jobs SET status='succeeded',transcript=$2,suggestions=$3,updated_at=now() WHERE id=$1",[job.id,JSON.stringify(segments),JSON.stringify(suggestions)]);
 if(job.usage_ledger_id){await db.query("UPDATE ai_usage_ledger SET status='consumed' WHERE id=$1 AND status='reserved'",[job.usage_ledger_id]);await db.query("UPDATE ai_usage_accounts SET consumed_units=consumed_units+1,updated_at=now() WHERE user_id=$1",[job.requested_by]);}
 }finally{if(media)await unlink(source).catch(()=>{});}
}
console.log('PUMPCLIP AI worker started');
while(true){let job;
 try{
  await db.query('BEGIN');const found=await db.query(`SELECT j.*,a.object_key FROM ai_jobs j JOIN media_assets a ON a.id=j.source_asset_id WHERE j.status='queued' ORDER BY j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1`);
  job=found.rows[0];if(job)await db.query("UPDATE ai_jobs SET status='processing',updated_at=now() WHERE id=$1",[job.id]);await db.query('COMMIT');
  if(!job){await wait(2000);continue;}
  try{await processJob(job);}catch(e){await db.query("UPDATE ai_jobs SET status='failed',error_message=$2,updated_at=now() WHERE id=$1",[job.id,String(e).slice(0,500)]);if(job.usage_ledger_id){const ledger=(await db.query("SELECT metadata FROM ai_usage_ledger WHERE id=$1 AND status='reserved'",[job.usage_ledger_id])).rows[0];if(ledger){const meta=ledger.metadata||{};await db.query('UPDATE ai_usage_accounts SET free_units=free_units+$2,balance_units=balance_units+$3,updated_at=now() WHERE user_id=$1',[job.requested_by,Number(meta.freeUnits||0),Number(meta.paidUnits||0)]);await db.query("UPDATE ai_usage_ledger SET status='released' WHERE id=$1",[job.usage_ledger_id]);}}console.error('AI job failed',job.id,e);}
 }catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(e);await wait(5000);}
}
