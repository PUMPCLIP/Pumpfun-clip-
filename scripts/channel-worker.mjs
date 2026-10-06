import pg from 'pg';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const databaseUrl=process.env.DATABASE_URL||'';
const ssl=process.env.DATABASE_SSL==='disable'?undefined:(databaseUrl?{rejectUnauthorized:false}:undefined);
const db=new pg.Client({connectionString:databaseUrl,ssl,connectionTimeoutMillis:10000});
const python=process.env.PUMPCLIP_PYTHON||'python3';
const engine=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../engine/video.py');
const LEASE_MS=Number(process.env.CHANNEL_WORKER_LEASE_MS||15*60*1000);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function invoke(args){return new Promise((resolve,reject)=>{const proc=spawn(python,[engine,...args],{stdio:['ignore','pipe','pipe'],env:{...process.env,PYTHONUNBUFFERED:'1',PYTHONDONTWRITEBYTECODE:'1'}});let out='',err='';proc.stdout.on('data',x=>out=(out+x).slice(-1024*1024));proc.stderr.on('data',x=>err=(err+x).slice(-8000));proc.on('error',reject);proc.on('close',code=>{if(code===0)try{resolve(JSON.parse(out));}catch{reject(new Error('Channel enumerator returned invalid JSON'));}else reject(new Error((err||out||`Channel enumerator exited ${code}`).slice(-4000)));});});}
async function claim(){await db.query('BEGIN');try{await db.query("UPDATE channel_ingestions SET status='queued',lease_id=NULL,lease_expires_at=NULL,updated_at=now() WHERE status='processing' AND lease_expires_at IS NOT NULL AND lease_expires_at<now()");const leaseId=crypto.randomUUID();const result=await db.query(`SELECT * FROM channel_ingestions WHERE status='queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`);const job=result.rows[0];if(job){await db.query("UPDATE channel_ingestions SET status='processing',lease_id=$2,lease_expires_at=now()+($3::text||' milliseconds')::interval,updated_at=now() WHERE id=$1",[job.id,leaseId,LEASE_MS]);job.lease_id=leaseId;}await db.query('COMMIT');return job;}catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}}
async function reserveClip(job,video){
  const key=`channel:${job.id}:${video.externalId}`; const existing=await db.query('SELECT id FROM ai_usage_ledger WHERE user_id=$1 AND idempotency_key=$2',[job.user_id,key]); if(existing.rowCount)return 'existing';
  const account=(await db.query('SELECT * FROM ai_usage_accounts WHERE user_id=$1 FOR UPDATE',[job.user_id])).rows[0]||null;
  if(!account){await db.query('INSERT INTO ai_usage_accounts(user_id) VALUES($1)',[job.user_id]);}
  const locked=(await db.query('SELECT * FROM ai_usage_accounts WHERE user_id=$1 FOR UPDATE',[job.user_id])).rows[0];
  if(Number(locked.free_units)+Number(locked.balance_units)<5)return 'credits';
  const free=Math.min(Number(locked.free_units),5),paid=5-free;
  await db.query('UPDATE ai_usage_accounts SET free_units=free_units-$2,balance_units=balance_units-$3,updated_at=now() WHERE user_id=$1',[job.user_id,free,paid]);
  const ledger=(await db.query(`INSERT INTO ai_usage_ledger(user_id,action,units,status,idempotency_key,metadata) VALUES($1,'native_clip',5,'reserved',$2,$3) RETURNING id`,[job.user_id,key,JSON.stringify({channelIngestionId:job.id,externalId:video.externalId,freeUnits:free,paidUnits:paid})])).rows[0];
  const clip=(await db.query(`INSERT INTO ai_clip_requests(user_id,source_url,instructions,aspect_ratio,caption,caption_style,usage_ledger_id,status,engine,channel_video_id)
    VALUES($1,$2,$3,'9:16','', 'classic',$4,'queued','native',$5) RETURNING id`,[job.user_id,video.sourceUrl,'Find the most compelling moment from this video and turn it into a concise vertical clip with a strong hook.',ledger.id,video.id])).rows[0];
  await db.query("UPDATE channel_ingestion_videos SET status='clip_queued',clip_request_id=$2,updated_at=now() WHERE id=$1",[video.id,clip.id]); return 'queued';
}
async function process(job){
  try{
    const listed=await invoke(['channel-list','--url',job.channel_url,'--max-videos',String(job.max_videos)]);
    await db.query('BEGIN');
    await db.query('UPDATE channel_ingestions SET discovered_count=$2,updated_at=now() WHERE id=$1 AND lease_id=$3',[job.id,listed.videos.length,job.lease_id]);
    let queued=0;
    for(const item of listed.videos){
      const inserted=await db.query(`INSERT INTO channel_ingestion_videos(ingestion_id,external_id,source_url,title,position) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(ingestion_id,external_id) DO UPDATE SET title=EXCLUDED.title,source_url=EXCLUDED.source_url RETURNING *`,[job.id,item.externalId,item.sourceUrl,item.title,item.position]);
      const video=inserted.rows[0]; if(!video||video.status!=='discovered')continue;
      const result=await reserveClip(job,video);
      if(result==='queued')queued++;
      if(result==='credits')await db.query("UPDATE channel_ingestion_videos SET status='failed',error_message='Not enough AI credits for this clip.',updated_at=now() WHERE id=$1",[video.id]);
    }
    await db.query("UPDATE channel_ingestions SET status='completed',queued_count=queued_count+$2,lease_id=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=$1 AND lease_id=$3",[job.id,queued,job.lease_id]);
    await db.query('COMMIT'); console.log(JSON.stringify({event:'channel_ingestion_completed',ingestionId:job.id,discovered:listed.videos.length,queued}));
  }catch(error){await db.query('ROLLBACK').catch(()=>{});await db.query("UPDATE channel_ingestions SET status='failed',error_message=$2,lease_id=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=$1 AND lease_id=$3",[job.id,String(error?.message||error).slice(0,1000),job.lease_id]).catch(()=>{});console.error(JSON.stringify({event:'channel_ingestion_failed',ingestionId:job.id,error:String(error?.message||error)}));}
}
async function main(){await db.connect();console.log(JSON.stringify({event:'channel_worker_started'}));while(true){const job=await claim();if(job)await process(job);else await wait(Number(process.env.CHANNEL_WORKER_POLL_MS||5000));}}
main().catch(error=>{console.error(error);process.exitCode=1;});
