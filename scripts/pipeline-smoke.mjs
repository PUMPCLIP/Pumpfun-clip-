import pg from 'pg';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,copyFile,stat,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {S3Client,GetObjectCommand,PutObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';

const runId=process.argv[2]||'';
if(!/^[A-Za-z0-9][A-Za-z0-9-]{2,63}$/.test(runId))throw new Error('Pass a safe, unique pipeline smoke run id (3-64 alphanumeric/hyphen characters).');
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required.');

const SAMPLE_URL='https://docs.evostream.com/sample_content/assets/bun33s.mp4';
const YOUTUBE_URL='https://www.youtube.com/watch?v=aqz-KE-bpKQ';
const SAMPLE_LIMIT=24*1024*1024;
const INITIAL_FREE_UNITS=11; // one transcript analysis and two five-unit clip jobs
const USER_EMAIL=`pumpclip-pipeline-${runId}@example.invalid`;
const APP_ORIGIN=new URL(process.env.APP_URL||'https://pumpclip.app').origin;
const databaseUrl=process.env.DATABASE_URL;
const ssl=process.env.DATABASE_SSL==='disable'?undefined:{rejectUnauthorized:false};
const db=new pg.Client({connectionString:databaseUrl,ssl,connectionTimeoutMillis:10000});
const mediaBucket=process.env.MEDIA_BUCKET||'';
const media=mediaBucket?new S3Client({
  region:process.env.MEDIA_REGION||'auto',
  endpoint:process.env.MEDIA_ENDPOINT||undefined,
  forcePathStyle:!!process.env.MEDIA_ENDPOINT,
  credentials:process.env.MEDIA_ACCESS_KEY_ID&&process.env.MEDIA_SECRET_ACCESS_KEY
    ?{accessKeyId:process.env.MEDIA_ACCESS_KEY_ID,secretAccessKey:process.env.MEDIA_SECRET_ACCESS_KEY}
    :undefined,
}):null;
const privateRoot=path.resolve('data/private');
const sourceKey=`pipeline-smoke/${runId}/big-buck-bunny-33s.mp4`;
const analysisKey=`pipeline-smoke:${runId}:analysis`;
const assetClipKey=`pipeline-smoke:${runId}:asset-clip`;
const youtubeClipKey=`pipeline-smoke:${runId}:youtube-clip`;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function log(event,details={}){
  console.log(JSON.stringify({event,runId,at:new Date().toISOString(),...details}));
}
function localPath(key){
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,240}$/.test(key)||key.split('/').includes('..'))throw new Error('Invalid private media key');
  const resolved=path.resolve(privateRoot,key);
  if(!resolved.startsWith(privateRoot+path.sep))throw new Error('Invalid private media path');
  return resolved;
}
function execute(command,args,{timeoutMs=120000}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{stdio:['ignore','pipe','pipe'],env:{...process.env,PYTHONUNBUFFERED:'1',PYTHONDONTWRITEBYTECODE:'1'}});
    let stdout='',stderr='';
    const timer=setTimeout(()=>child.kill('SIGKILL'),timeoutMs);
    child.stdout.on('data',data=>{stdout=(stdout+data.toString()).slice(-16000);});
    child.stderr.on('data',data=>{stderr=(stderr+data.toString()).slice(-16000);});
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.on('close',code=>{
      clearTimeout(timer);
      if(code===0)resolve({stdout,stderr});
      else reject(Object.assign(new Error((stderr||stdout||`${command} exited ${code}`).slice(-4000)),{code,stdout,stderr}));
    });
  });
}
async function fetchSample(){
  const response=await fetch(SAMPLE_URL,{redirect:'follow',headers:{'user-agent':'Pumpclip-Pipeline-Smoke/1.0'},signal:AbortSignal.timeout(45000)});
  const finalUrl=new URL(response.url);
  if(!response.ok||finalUrl.protocol!=='https:'||!['docs.evostream.com','test-videos.co.uk'].includes(finalUrl.hostname))
    throw new Error(`Licensed sample fetch failed or redirected to an unapproved host (HTTP ${response.status}).`);
  const announced=Number(response.headers.get('content-length')||0);
  if(announced>SAMPLE_LIMIT)throw new Error('Sample exceeds the 24 MiB smoke-test limit.');
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length<1024||bytes.length>SAMPLE_LIMIT||bytes.subarray(4,8).toString('ascii')!=='ftyp')
    throw new Error('Sample response is not a bounded MP4 file.');
  return bytes;
}
async function stageSource(bytes){
  if(media){
    await media.send(new PutObjectCommand({Bucket:mediaBucket,Key:sourceKey,Body:bytes,ContentLength:bytes.length,ContentType:'video/mp4',ServerSideEncryption:process.env.MEDIA_SSE==='AES256'?'AES256':undefined}));
  }else{
    const target=localPath(sourceKey);
    await mkdir(path.dirname(target),{recursive:true,mode:0o700});
    await writeFile(target,bytes,{mode:0o600});
  }
}
async function seedTestRecords(bytes){
  const digest=crypto.createHash('sha256').update(bytes).digest('hex');
  await db.query('BEGIN');
  try{
    let user=(await db.query('SELECT id FROM users WHERE email=$1 ORDER BY created_at LIMIT 1',[USER_EMAIL])).rows[0];
    if(!user)user=(await db.query(`INSERT INTO users(google_sub,email,display_name,auth_provider,email_verified)
      VALUES(NULL,$1,$2,'pipeline_test',false) RETURNING id`,[USER_EMAIL,`Pipeline test ${runId}`])).rows[0];
    await db.query('INSERT INTO ai_usage_accounts(user_id,free_units,balance_units) VALUES($1,$2,0) ON CONFLICT(user_id) DO NOTHING',[user.id,INITIAL_FREE_UNITS]);
    let asset=(await db.query(`SELECT id FROM media_assets WHERE owner_id=$1 AND kind='source' AND object_key=$2 LIMIT 1`,[user.id,sourceKey])).rows[0];
    if(!asset)asset=(await db.query(`INSERT INTO media_assets(owner_id,kind,object_key,sha256,mime,byte_size,status)
      VALUES($1,'source',$2,$3,'video/mp4',$4,'verified') RETURNING id`,[user.id,sourceKey,digest,bytes.length])).rows[0];
    else await db.query("UPDATE media_assets SET sha256=$2,mime='video/mp4',byte_size=$3,status='verified' WHERE id=$1",[asset.id,digest,bytes.length]);
    let campaign=(await db.query('SELECT id FROM campaigns WHERE streamer_id=$1 AND title=$2 LIMIT 1',[user.id,`Pipeline smoke ${runId}`])).rows[0];
    if(!campaign)campaign=(await db.query('INSERT INTO campaigns(streamer_id,title) VALUES($1,$2) RETURNING id',[user.id,`Pipeline smoke ${runId}`])).rows[0];
    await db.query('COMMIT');
    return {userId:user.id,assetId:asset.id,campaignId:campaign.id,sha256:digest};
  }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
async function reserveUnits(userId,action,key,units,details={}){
  await db.query('BEGIN');
  try{
    const existing=(await db.query('SELECT * FROM ai_usage_ledger WHERE user_id=$1 AND idempotency_key=$2',[userId,key])).rows[0];
    if(existing){await db.query('COMMIT');return existing;}
    await db.query('INSERT INTO ai_usage_accounts(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING',[userId]);
    const account=(await db.query('SELECT free_units,balance_units FROM ai_usage_accounts WHERE user_id=$1 FOR UPDATE',[userId])).rows[0];
    const available=Number(account.free_units)+Number(account.balance_units);
    if(available<units)throw new Error(`Smoke-test account lacks ${units} units for ${action}.`);
    const free=Math.min(Number(account.free_units),units),paid=units-free;
    await db.query('UPDATE ai_usage_accounts SET free_units=free_units-$2,balance_units=balance_units-$3,updated_at=now() WHERE user_id=$1',[userId,free,paid]);
    const ledger=(await db.query(`INSERT INTO ai_usage_ledger(user_id,action,units,status,idempotency_key,metadata)
      VALUES($1,$2,$3,'reserved',$4,$5) RETURNING *`,[userId,action,units,key,JSON.stringify({...details,freeUnits:free,paidUnits:paid})])).rows[0];
    await db.query('COMMIT');
    return ledger;
  }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
async function reserveAndCreateAiJob(userId,campaignId,assetId){
  const ledger=await reserveUnits(userId,'highlight_analysis',analysisKey,1,{sourceAssetId:assetId,runId});
  const result=await db.query(`INSERT INTO ai_jobs(campaign_id,source_asset_id,requested_by,usage_ledger_id,status)
    VALUES($1,$2,$3,$4,'queued') ON CONFLICT(campaign_id,source_asset_id)
    DO UPDATE SET usage_ledger_id=COALESCE(ai_jobs.usage_ledger_id,EXCLUDED.usage_ledger_id) RETURNING id,status,usage_ledger_id`,
    [campaignId,assetId,userId,ledger.id]);
  return {ledgerId:ledger.id,...result.rows[0]};
}
async function reserveAndCreateClip(userId,{key,sourceAssetId=null,sourceUrl=null,start,end,instructions}){
  const ledger=await reserveUnits(userId,'native_clip',key,5,{sourceAssetId,sourceUrl,runId});
  const existing=(await db.query('SELECT id,status,output_asset_id,error_message FROM ai_clip_requests WHERE usage_ledger_id=$1',[ledger.id])).rows[0];
  if(existing)return {ledgerId:ledger.id,...existing};
  if(ledger.status!=='reserved')throw new Error(`Cannot create a new clip from a ${ledger.status} ledger.`);
  try{
    const row=(await db.query(`INSERT INTO ai_clip_requests(user_id,source_asset_id,source_url,instructions,aspect_ratio,
      start_seconds,end_seconds,caption,caption_style,usage_ledger_id,status,engine)
      VALUES($1,$2,$3,$4,'9:16',$5,$6,'','classic',$7,'queued','native') RETURNING id,status,output_asset_id,error_message`,
      [userId,sourceAssetId,sourceUrl,instructions,start,end,ledger.id])).rows[0];
    return {ledgerId:ledger.id,...row};
  }catch(error){
    await db.query('BEGIN');
    try{
      const reserved=(await db.query("SELECT * FROM ai_usage_ledger WHERE id=$1 AND status='reserved' FOR UPDATE",[ledger.id])).rows[0];
      if(reserved){const meta=reserved.metadata||{};await db.query('UPDATE ai_usage_accounts SET free_units=free_units+$2,balance_units=balance_units+$3 WHERE user_id=$1',[userId,Number(meta.freeUnits||0),Number(meta.paidUnits||0)]);await db.query("UPDATE ai_usage_ledger SET status='released' WHERE id=$1 AND status='reserved'",[ledger.id]);}
      await db.query('COMMIT');
    }catch(refundError){await db.query('ROLLBACK').catch(()=>{});throw refundError;}
    throw error;
  }
}
async function waitForJob(table,id,{timeoutMs=8*60*1000}={}){
  const started=Date.now();let prior='';let lastProgress=started;
  while(Date.now()-started<timeoutMs){
    const row=(await db.query(`SELECT * FROM ${table} WHERE id=$1`,[id])).rows[0];
    if(!row)throw new Error(`Smoke job ${id} disappeared from ${table}.`);
    if(row.status!==prior){prior=row.status;lastProgress=Date.now();log('pipeline_smoke_job_status',{table,id,status:row.status});}
    if(row.status==='succeeded'||row.status==='failed')return row;
    if(Date.now()-lastProgress>=15000){lastProgress=Date.now();log('pipeline_smoke_waiting',{table,id,status:row.status,elapsedSeconds:Math.round((Date.now()-started)/1000)});}
    await wait(2000);
  }
  throw new Error(`Timed out waiting for ${table} ${id} after ${timeoutMs/1000}s.`);
}
function parseJson(value){if(value==null)return null;if(typeof value==='string'){try{return JSON.parse(value);}catch{return null;}}return value;}
function chooseRange(transcript,suggestions,duration){
  const candidates=Array.isArray(suggestions)?suggestions:[];
  for(const item of candidates){
    const start=Number(item.start),end=Math.min(Number(item.end),start+30,duration);
    if(Number.isFinite(start)&&Number.isFinite(end)&&start>=0&&end>start)return {start:Number(start.toFixed(3)),end:Number(end.toFixed(3)),source:'ai_suggestion',excerpt:String(item.hook||'').slice(0,180)};
  }
  const segments=Array.isArray(transcript)?transcript:[];
  const valid=segments.find(item=>Number.isFinite(Number(item.start))&&Number(item.start)>=0&&Number(item.start)<duration);
  if(valid){const start=Math.min(Number(valid.start),Math.max(0,duration-15));return {start:Number(start.toFixed(3)),end:Number(Math.min(duration,start+15).toFixed(3)),source:'transcript_segment_fallback',excerpt:String(valid.text||'').slice(0,180)};}
  const start=0,end=Math.min(15,duration);
  return {start:Number(start.toFixed(3)),end:Number(end.toFixed(3)),source:'no_speech_fallback',excerpt:''};
}
async function shareUrl(jobId,asset){
  if(media){
    const url=await getSignedUrl(media,new GetObjectCommand({Bucket:mediaBucket,Key:asset.object_key,ResponseContentType:'video/mp4',ResponseContentDisposition:`inline; filename="pumpclip-${asset.id}.mp4"`}),{expiresIn:24*60*60});
    return {url,expiresAt:new Date(Date.now()+24*60*60*1000).toISOString(),kind:'presigned-object-url'};
  }
  const token=crypto.randomBytes(32).toString('base64url');
  const hash=crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt=new Date(Date.now()+24*60*60*1000).toISOString();
  await db.query("UPDATE ai_clip_requests SET output=output||jsonb_build_object('shareTokenHash',$2,'shareExpiresAt',$3::text) WHERE id=$1",[jobId,hash,expiresAt]);
  return {url:`${APP_ORIGIN}/api/v1/pipeline-smoke/${token}`,expiresAt,kind:'temporary-capability-url'};
}
async function verifyOutput(asset){
  const tempDir=await import('node:fs/promises').then(fs=>fs.mkdtemp(path.join(os.tmpdir(),'pumpclip-output-')));
  const tempFile=path.join(tempDir,`${asset.id}.mp4`);
  try{
    if(media){
      const object=await media.send(new GetObjectCommand({Bucket:mediaBucket,Key:asset.object_key}));
      const bytes=Buffer.from(await object.Body.transformToByteArray());
      if(!bytes.length||bytes.length>250*1024*1024)throw new Error('Rendered S3 output is empty or exceeds 250 MiB.');
      await writeFile(tempFile,bytes,{mode:0o600});
    }else await copyFile(localPath(asset.object_key),tempFile);
    const result=await execute('ffprobe',['-v','error','-show_entries','format=duration,size:stream=codec_type,codec_name,width,height','-of','json',tempFile],{timeoutMs:30000});
    const probe=JSON.parse(result.stdout),duration=Number(probe.format?.duration||0),size=Number(probe.format?.size||0);
    const streams=probe.streams||[];
    if(!(duration>0)||!streams.some(stream=>stream.codec_type==='video')||!size)throw new Error('Rendered MP4 failed ffprobe validation.');
    return {duration:Number(duration.toFixed(3)),size,videoCodec:streams.find(stream=>stream.codec_type==='video')?.codec_name||null,audioCodec:streams.find(stream=>stream.codec_type==='audio')?.codec_name||null,width:streams.find(stream=>stream.codec_type==='video')?.width||null,height:streams.find(stream=>stream.codec_type==='video')?.height||null};
  }finally{await rm(tempDir,{recursive:true,force:true});}
}
async function reportClip(jobId){
  const row=(await db.query(`SELECT r.id,r.status,r.output_asset_id,r.output,r.error_message,r.start_seconds,r.end_seconds,
    a.object_key,a.mime,a.byte_size FROM ai_clip_requests r LEFT JOIN media_assets a ON a.id=r.output_asset_id WHERE r.id=$1`,[jobId])).rows[0];
  if(!row||row.status!=='succeeded'||!row.output_asset_id)throw new Error(`Clip ${jobId} did not complete successfully: ${row?.error_message||row?.status||'missing row'}`);
  const asset={id:row.output_asset_id,object_key:row.object_key,mime:row.mime,byte_size:Number(row.byte_size)};
  const mediaProbe=await verifyOutput(asset);
  const share=await shareUrl(jobId,asset);
  return {jobId,status:row.status,assetId:asset.id,assetBytes:asset.byte_size,...mediaProbe,range:{start:Number(row.start_seconds),end:Number(row.end_seconds)},url:share.url,urlKind:share.kind,expiresAt:share.expiresAt};
}
async function finalUsage(userId){
  const account=(await db.query('SELECT free_units,balance_units,consumed_units FROM ai_usage_accounts WHERE user_id=$1',[userId])).rows[0];
  const ledger=(await db.query('SELECT action,units,status,idempotency_key FROM ai_usage_ledger WHERE user_id=$1 AND idempotency_key LIKE $2 ORDER BY created_at',[userId,`pipeline-smoke:${runId}:%`])).rows;
  return {account:{freeUnits:Number(account.free_units),balanceUnits:Number(account.balance_units),consumedUnits:Number(account.consumed_units)},ledger};
}

let exitCode=0;
await db.connect();
try{
  log('pipeline_smoke_started',{sampleUrl:SAMPLE_URL,youtubeUrl:YOUTUBE_URL,storage:media?'object':'local',transcriptionEnabled:Boolean(process.env.OPENAI_API_KEY)});
  const bytes=await fetchSample();
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  await stageSource(bytes);
  const records=await seedTestRecords(bytes);
  log('pipeline_smoke_sample_staged',{userId:records.userId,assetId:records.assetId,bytes:bytes.length,sha256,sourceDurationSeconds:33.042,license:'Big Buck Bunny sample; Blender Foundation; CC BY 3.0'});

  let analysis={status:'skipped',segments:[],suggestions:[],error:null};
  if(process.env.OPENAI_API_KEY){
    const queued=await reserveAndCreateAiJob(records.userId,records.campaignId,records.assetId);
    log('pipeline_smoke_analysis_queued',{jobId:queued.id,ledgerId:queued.ledgerId,status:queued.status,units:1});
    const finished=await waitForJob('ai_jobs',queued.id);
    const transcript=parseJson(finished.transcript)||[];
    const suggestions=parseJson(finished.suggestions)||[];
    analysis={status:finished.status,jobId:finished.id,ledgerId:finished.usage_ledger_id,segments:Array.isArray(transcript)?transcript:[],suggestions:Array.isArray(suggestions)?suggestions:[],error:finished.error_message||null};
    log('pipeline_smoke_analysis_result',{jobId:finished.id,status:finished.status,segmentCount:analysis.segments.length,suggestionCount:analysis.suggestions.length,error:analysis.error});
    if(finished.status==='failed')exitCode=1;
  }else{
    log('pipeline_smoke_analysis_skipped',{reason:'OPENAI_API_KEY is not configured; Render transcription worker is disabled.'});
  }

  const range=chooseRange(analysis.segments,analysis.suggestions,33.042);
  const assetJob=await reserveAndCreateClip(records.userId,{key:assetClipKey,sourceAssetId:records.assetId,start:range.start,end:range.end,instructions:`Smoke test (${range.source}); source ${range.start}-${range.end}s.`});
  log('pipeline_smoke_asset_clip_queued',{jobId:assetJob.id,ledgerId:assetJob.ledgerId,status:assetJob.status,units:5,range,source:'licensed uploaded sample'});
  const assetDone=await waitForJob('ai_clip_requests',assetJob.id);
  let assetResult=null;
  if(assetDone.status==='succeeded'){
    assetResult=await reportClip(assetJob.id);
    log('pipeline_smoke_asset_clip_result',assetResult);
  }else{
    exitCode=1;
    log('pipeline_smoke_asset_clip_failed',{jobId:assetDone.id,error:assetDone.error_message});
  }

  const youtubeJob=await reserveAndCreateClip(records.userId,{key:youtubeClipKey,sourceUrl:YOUTUBE_URL,start:0,end:15,instructions:'Smoke test YouTube yt-dlp download and FFmpeg clip.'});
  log('pipeline_smoke_youtube_clip_queued',{jobId:youtubeJob.id,ledgerId:youtubeJob.ledgerId,status:youtubeJob.status,units:5,sourceUrl:YOUTUBE_URL,range:{start:0,end:15}});
  const youtubeDone=await waitForJob('ai_clip_requests',youtubeJob.id);
  let youtubeResult=null;
  if(youtubeDone.status==='succeeded'){
    youtubeResult=await reportClip(youtubeJob.id);
    log('pipeline_smoke_youtube_clip_result',youtubeResult);
  }else{
    exitCode=1;
    log('pipeline_smoke_youtube_clip_failed',{jobId:youtubeDone.id,error:youtubeDone.error_message});
  }

  const usage=await finalUsage(records.userId);
  const result={event:'pipeline_smoke_summary',runId,userId:records.userId,email:USER_EMAIL,sourceAssetId:records.assetId,
    transcription:{status:analysis.status,jobId:analysis.jobId||null,segments:analysis.segments.length,suggestions:analysis.suggestions.length,
      note:analysis.segments.length?'Timestamped speech segments returned by Whisper.':'The licensed Big Buck Bunny sample contains no recognized speech; an empty transcript is expected.'},
    selectedRange:range,assetClip:assetResult,youtubeClip:{status:youtubeDone.status,jobId:youtubeDone.id,error:youtubeDone.error_message||null,result:youtubeResult},
    usage,completedAt:new Date().toISOString()};
  log('pipeline_smoke_summary',result);
  if(!assetResult)exitCode=1;
}catch(error){
  exitCode=1;
  log('pipeline_smoke_fatal',{error:String(error?.message||error).slice(0,3000),stack:String(error?.stack||'').slice(-5000)});
}finally{
  await db.end().catch(()=>{});
}
process.exitCode=exitCode;
