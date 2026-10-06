import pg from 'pg';
import crypto from 'node:crypto';
import path from 'node:path';
import {mkdir,writeFile,access} from 'node:fs/promises';
import {S3Client,PutObjectCommand} from '@aws-sdk/client-s3';
import {mediaRoot,localMediaPath} from './media-root.mjs';

const databaseUrl=process.env.DATABASE_URL||'';
if(!databaseUrl) throw new Error('DATABASE_URL is required for the public demo seed');
const ssl=process.env.DATABASE_SSL==='disable'?undefined:{rejectUnauthorized:false};
const client=new pg.Client({connectionString:databaseUrl,ssl,connectionTimeoutMillis:15000});
const videoUrl=process.env.PUMPCLIP_DEMO_VIDEO_URL||'https://docs.evostream.com/sample_content/assets/bun33s.mp4';
const objectKey='public-demo/big-buck-bunny-vertical.mp4';
const media=process.env.MEDIA_BUCKET?new S3Client({
  region:process.env.MEDIA_REGION||'auto',
  endpoint:process.env.MEDIA_ENDPOINT||undefined,
  forcePathStyle:!!process.env.MEDIA_ENDPOINT,
  credentials:process.env.MEDIA_ACCESS_KEY_ID&&process.env.MEDIA_SECRET_ACCESS_KEY?{accessKeyId:process.env.MEDIA_ACCESS_KEY_ID,secretAccessKey:process.env.MEDIA_SECRET_ACCESS_KEY}:undefined,
}):null;

async function storeVideo(bytes){
  if(media){
    await media.send(new PutObjectCommand({Bucket:process.env.MEDIA_BUCKET,Key:objectKey,Body:bytes,ContentType:'video/mp4'}));
    return;
  }
  const target=localMediaPath(objectKey);
  await mkdir(path.dirname(target),{recursive:true});
  try{await access(target);}catch{await writeFile(target,bytes,{mode:0o600});}
}
async function upsertUser(googleSub,email,displayName,roles){
  const result=await client.query(`INSERT INTO users(google_sub,email,display_name,roles)
    VALUES($1,$2,$3,$4)
    ON CONFLICT(google_sub) DO UPDATE SET email=EXCLUDED.email,display_name=EXCLUDED.display_name,roles=EXCLUDED.roles,updated_at=now()
    RETURNING id`,[googleSub,email,displayName,roles]);
  return result.rows[0].id;
}
async function upsertCampaign(streamerId,title,description){
  const found=await client.query('SELECT id FROM campaigns WHERE streamer_id=$1 AND title=$2 LIMIT 1',[streamerId,title]);
  if(found.rowCount)return found.rows[0].id;
  const result=await client.query(`INSERT INTO campaigns(streamer_id,title,description,license_terms,target_platforms,state,start_at)
    VALUES($1,$2,$3,$4,$5,'live',now()) RETURNING id`,[streamerId,title,description,'Licensed demo footage for public product preview.',['youtube','tiktok','instagram']]);
  return result.rows[0].id;
}

try{
  await client.connect();
  const existing=await client.query(`SELECT count(*)::int AS count FROM submissions s
    JOIN campaigns c ON c.id=s.campaign_id
    WHERE c.title IN ('Big Buck Bunny · First Cut','Big Buck Bunny · Night Shift')
      AND s.state IN ('approved','published','rewarded')`);
  if(existing.rows[0].count>=2){
    console.log('[public-demo-seed] already seeded; nothing to do');
    process.exitCode=0;
  }else{
    const bytes=Buffer.from(await (await fetch(videoUrl,{signal:AbortSignal.timeout(90000)})).arrayBuffer());
    if(bytes.length<1024)throw new Error('Demo video download was unexpectedly empty');
    await storeVideo(bytes);
    const digest=crypto.createHash('sha256').update(bytes).digest('hex');
    const official=await upsertUser('pumpclip-public-official','official@pumpclip.app','Pumpclip Official',['streamer']);
    const creator=await upsertUser('pumpclip-demo-creator','creator.demo@pumpclip.app','Demo Creator',['streamer']);
    const clipper=await upsertUser('pumpclip-demo-clipper','clipper.demo@pumpclip.app','Demo Clipper',['clipper']);
    const editor=await upsertUser('pumpclip-demo-editor','editor.demo@pumpclip.app','Demo Editor',['clipper']);
    const asset=(await client.query(`INSERT INTO media_assets(owner_id,kind,object_key,sha256,mime,byte_size,source_url,rights_declared_at,status)
      VALUES($1,'clip',$2,$3,'video/mp4',$4,$5,now(),'verified')
      ON CONFLICT DO NOTHING RETURNING id`,[clipper,objectKey,digest,bytes.length,videoUrl])).rows[0]?.id
      ||(await client.query('SELECT id FROM media_assets WHERE object_key=$1 ORDER BY created_at DESC LIMIT 1',[objectKey])).rows[0].id;
    const campaigns=[
      [official,'Big Buck Bunny · First Cut','A public demo campaign showing how a source becomes a high-signal vertical cut.',clipper,digest],
      [creator,'Big Buck Bunny · Night Shift','A second public demo campaign for the creator and clipper directory.',editor,crypto.createHash('sha256').update(digest+':night-shift').digest('hex')],
    ];
    for(const [streamer,title,description,owner,hash] of campaigns){
      const campaign=await upsertCampaign(streamer,title,description);
      await client.query(`INSERT INTO submissions(campaign_id,clipper_id,asset_id,media_sha256,state,review_reason,reviewed_by)
        VALUES($1,$2,$3,$4,'published','Public product demo accepted for discovery',$5)
        ON CONFLICT(campaign_id,media_sha256) DO UPDATE SET clipper_id=EXCLUDED.clipper_id,asset_id=EXCLUDED.asset_id,state='published',review_reason=EXCLUDED.review_reason,reviewed_by=EXCLUDED.reviewed_by,updated_at=now()`,[campaign,owner,asset,hash,streamer]);
      const submission=(await client.query('SELECT id FROM submissions WHERE campaign_id=$1 AND media_sha256=$2',[campaign,hash])).rows[0].id;
      await client.query(`INSERT INTO clip_metrics(submission_id,view_count,like_count,share_count)
        VALUES($1,$2,$3,$4) ON CONFLICT(submission_id) DO UPDATE SET view_count=EXCLUDED.view_count,like_count=EXCLUDED.like_count,share_count=EXCLUDED.share_count,updated_at=now()`,[submission,title.includes('Night')?1840:2640,title.includes('Night')?132:207,title.includes('Night')?48:71]);
      await client.query(`INSERT INTO reputation_scores(user_id,accepted_count,total_views,reputation_score)
        VALUES($1,1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET accepted_count=GREATEST(reputation_scores.accepted_count,1),total_views=GREATEST(reputation_scores.total_views,EXCLUDED.total_views),reputation_score=GREATEST(reputation_scores.reputation_score,EXCLUDED.reputation_score),updated_at=now()`,[owner,title.includes('Night')?1840:2640,title.includes('Night')?18.4:26.4]);
    }
    console.log(JSON.stringify({seeded:true,videoUrl,objectKey,profiles:4,acceptedClips:2}));
  }
}finally{await client.end().catch(()=>{});}
