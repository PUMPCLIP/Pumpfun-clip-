import pg from 'pg';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {S3Client,GetObjectCommand,PutObjectCommand} from '@aws-sdk/client-s3';
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
const storage=path.resolve('data/private');
const media=process.env.MEDIA_BUCKET?new S3Client({region:process.env.MEDIA_REGION||'auto',endpoint:process.env.MEDIA_ENDPOINT||undefined,forcePathStyle:!!process.env.MEDIA_ENDPOINT,credentials:process.env.MEDIA_ACCESS_KEY_ID&&process.env.MEDIA_SECRET_ACCESS_KEY?{accessKeyId:process.env.MEDIA_ACCESS_KEY_ID,secretAccessKey:process.env.MEDIA_SECRET_ACCESS_KEY}:undefined}):null;
async function sourceFile(key){if(!media)return path.join(storage,key);const result=await media.send(new GetObjectCommand({Bucket:process.env.MEDIA_BUCKET,Key:key}));const temp=path.join(storage,crypto.randomUUID()+'.source');await writeFile(temp,Buffer.from(await result.Body.transformToByteArray()));return temp;}
await client.connect();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function render(input,output,start,duration,caption,captionStyle='classic') {
  let subtitleFilter='';
  if(caption.trim()) {
    const subtitle=output+'.srt';
    const clean=caption.replace(/[\r\n<>]/g,' ').slice(0,200);
    const timestamp=seconds=>{const ms=Math.floor(seconds*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};
    await writeFile(subtitle,`1\n00:00:00,000 --> ${timestamp(duration)}\n${clean}\n`);
    const styles={classic:'',bold:':force_style=FontSize=25\\,Outline=3\\,Shadow=1\\,Alignment=2\\,MarginV=140',signal:':force_style=FontSize=25\\,PrimaryColour=&H0000EFFF\\,Outline=3\\,Shadow=1\\,Alignment=2\\,MarginV=140'};
    subtitleFilter=`,subtitles=${subtitle}${styles[captionStyle]||''}`;
  }
  return new Promise((resolve,reject)=>{
    const args=['-hide_banner','-loglevel','error','-y','-ss',String(start),'-i',input,'-t',String(duration),
      '-vf','scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1'+subtitleFilter,
      '-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart'];
    args.push(output);
    const proc=spawn('ffmpeg',args,{stdio:['ignore','ignore','pipe']});let error='';
    proc.stderr.on('data',d=>error+=d.toString().slice(0,1000));
    proc.on('close',code=>code===0?resolve():reject(new Error(error||'FFmpeg failed')));
  });
}
async function tick() {
  await client.query('BEGIN');
  let job;
  try {
    const result=await client.query(`SELECT j.*,a.object_key FROM studio_jobs j JOIN studio_projects p ON p.id=j.project_id
      JOIN media_assets a ON a.id=p.source_asset_id WHERE j.status='queued' ORDER BY j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1`);
    job=result.rows[0];
    if(job) await client.query("UPDATE studio_jobs SET status='processing',updated_at=now() WHERE id=$1",[job.id]);
    await client.query('COMMIT');
  } catch(e) {await client.query('ROLLBACK');throw e;}
  if(!job) return false;
  const key=crypto.randomUUID()+'.mp4',output=path.join(storage,key);
  try {
    await mkdir(storage,{recursive:true});
    const source=await sourceFile(job.object_key);
    try {await render(source,output,Number(job.start_seconds),Number(job.end_seconds)-Number(job.start_seconds),job.caption,job.caption_style);} finally {if(media)await (await import('node:fs/promises')).unlink(source).catch(()=>{});}
    const bytes=await readFile(output),sha=crypto.createHash('sha256').update(bytes).digest('hex');
    if(media)await media.send(new PutObjectCommand({Bucket:process.env.MEDIA_BUCKET,Key:key,Body:bytes,ContentType:'video/mp4'}));
    await client.query('BEGIN');
    const asset=await client.query(`INSERT INTO media_assets(owner_id,kind,object_key,sha256,mime,byte_size,status)
      VALUES($1,'clip',$2,$3,'video/mp4',$4,'verified') RETURNING id`,[job.owner_id,key,sha,bytes.length]);
    await client.query("UPDATE studio_jobs SET status='succeeded',output_asset_id=$2,updated_at=now() WHERE id=$1",[job.id,asset.rows[0].id]);
    await client.query('COMMIT');
  } catch(e) {
    await client.query('ROLLBACK').catch(()=>{});
    await client.query("UPDATE studio_jobs SET status='failed',error_message=$2,updated_at=now() WHERE id=$1",[job.id,String(e).slice(0,1000)]);
    console.error('Job failed',job.id,e);
  }
  return true;
}
console.log('PUMPCLIP studio worker started');
process.on('SIGTERM',async()=>{await client.end();process.exit(0);});
while(true) {try {if(!await tick()) await pause(2000);} catch(e) {console.error(e);await pause(5000);}}
