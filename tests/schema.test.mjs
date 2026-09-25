import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('database rejects wallet reuse, duplicate clip hashes and overreserved escrow',async()=>{
  const db=new PGlite();
  try {
    for(const name of ['001_core.sql','002_studio.sql','003_rewards.sql','004_ai.sql','005_social.sql','006_tiktok.sql','007_youtube_uploads.sql','008_publications.sql','009_proof_and_operations.sql','011_feed_ai_usage.sql','012_native_video_clips.sql']) {
      const sql=readFileSync('db/migrations/'+name,'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;','');
      await db.exec(sql);
    }
    const u1=(await db.query("INSERT INTO users(google_sub,email,display_name) VALUES('g1','one@example.com','One') RETURNING id")).rows[0].id;
    const u2=(await db.query("INSERT INTO users(google_sub,email,display_name) VALUES('g2','two@example.com','Two') RETURNING id")).rows[0].id;
    await db.query('INSERT INTO wallets(user_id,address,network) VALUES($1,$2,$3)',[u1,'wallet-one','devnet']);
    await assert.rejects(db.query('INSERT INTO wallets(user_id,address,network) VALUES($1,$2,$3)',[u2,'wallet-one','devnet']));
    const c=(await db.query('INSERT INTO campaigns(streamer_id,title) VALUES($1,$2) RETURNING id',[u1,'First campaign'])).rows[0].id;
    await db.query('INSERT INTO escrow_accounts(campaign_id,funded_lamports) VALUES($1,100)',[c]);
    await assert.rejects(db.query('UPDATE escrow_accounts SET reserved_lamports=101 WHERE campaign_id=$1',[c]));
    await db.query('INSERT INTO submissions(campaign_id,clipper_id,media_sha256) VALUES($1,$2,$3)',[c,u2,'a'.repeat(64)]);
    await assert.rejects(db.query('INSERT INTO submissions(campaign_id,clipper_id,media_sha256) VALUES($1,$2,$3)',[c,u2,'a'.repeat(64)]));
    await db.query("INSERT INTO fee_intents(user_id,campaign_id,purpose,mint,amount_raw,treasury,idempotency_key,signature) VALUES($1,$2,'entry','mint',1,'treasury','key-one','sig-one')",[u2,c]);
    await assert.rejects(db.query("INSERT INTO fee_intents(user_id,campaign_id,purpose,mint,amount_raw,treasury,idempotency_key,signature) VALUES($1,$2,'creation','mint',1,'treasury','key-two','sig-one')",[u1,c]));
    const asset=(await db.query("INSERT INTO media_assets(owner_id,kind,object_key,mime,byte_size) VALUES($1,'clip','key','video/mp4',100) RETURNING id",[u2])).rows[0].id;
    const nativeLedger=(await db.query("INSERT INTO ai_usage_ledger(user_id,action,units,idempotency_key) VALUES($1,'native_clip',5,'native-job-key') RETURNING id",[u2])).rows[0].id;
    await db.query("INSERT INTO ai_clip_requests(user_id,source_url,instructions,aspect_ratio,start_seconds,end_seconds,usage_ledger_id) VALUES($1,'https://youtube.com/watch?v=test','00:10-00:20','1:1',10,20,$2)",[u2,nativeLedger]);
    await assert.rejects(db.query("INSERT INTO ai_clip_requests(user_id,source_url,aspect_ratio,start_seconds,end_seconds) VALUES($1,'https://youtube.com/watch?v=test','4:3',0,30)",[u2]));
    await assert.rejects(db.query("INSERT INTO ai_clip_requests(user_id,source_url,aspect_ratio,start_seconds,end_seconds) VALUES($1,'https://youtube.com/watch?v=test','9:16',0,181)",[u2]));
    await db.query('INSERT INTO tiktok_drafts(user_id,asset_id) VALUES($1,$2)',[u2,asset]);
    await assert.rejects(db.query('INSERT INTO tiktok_drafts(user_id,asset_id) VALUES($1,$2)',[u2,asset]));
    await db.query('INSERT INTO youtube_uploads(user_id,asset_id,byte_size) VALUES($1,$2,100)',[u2,asset]);
    await assert.rejects(db.query('INSERT INTO youtube_uploads(user_id,asset_id,byte_size) VALUES($1,$2,100)',[u2,asset]));
    await db.query("INSERT INTO social_publications(user_id,asset_id,provider) VALUES($1,$2,'x')",[u2,asset]);
    await assert.rejects(db.query("INSERT INTO social_publications(user_id,asset_id,provider) VALUES($1,$2,'x')",[u2,asset]));
    await db.query("UPDATE campaigns SET proof_policy='provider' WHERE id=$1",[c]);
    await assert.rejects(db.query("UPDATE campaigns SET proof_policy='unreviewed' WHERE id=$1",[c]));
    const submission=(await db.query('SELECT id FROM submissions WHERE campaign_id=$1 LIMIT 1',[c])).rows[0].id;
    await assert.rejects(db.query('UPDATE submissions SET publication_id=$2 WHERE id=$1',[submission,'00000000-0000-0000-0000-000000000001']));
    await db.query('INSERT INTO content_reports(reporter_id,submission_id,reason) VALUES($1,$2,$3)',[u1,submission,'Potential stolen content']);
    await assert.rejects(db.query('INSERT INTO content_reports(reporter_id,submission_id,reason) VALUES($1,$2,$3)',[u1,submission,'Duplicate report']));
    await assert.rejects(db.query('INSERT INTO user_rate_limits(user_id,action,request_count) VALUES($1,$2,0)',[u1,'upload']));
    for(const name of ['012_native_video_clips.sql','011_feed_ai_usage.sql','009_proof_and_operations.sql','008_publications.sql','007_youtube_uploads.sql','006_tiktok.sql','005_social.sql','004_ai.sql','003_rewards.sql','002_studio.sql','001_core.sql']) await db.exec(readFileSync('db/migrations/down/'+name,'utf8'));
    const tables=await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('users','campaigns','studio_jobs')");
    assert.equal(tables.rows.length,0);
  } finally {await db.close();}
});

test('native migration upgrades legacy provider jobs without losing credits',async()=>{
  const db=new PGlite();
  try{
    for(const name of ['001_core.sql','002_studio.sql','003_rewards.sql','004_ai.sql','005_social.sql','006_tiktok.sql','007_youtube_uploads.sql','008_publications.sql','009_proof_and_operations.sql']) {
      const sql=readFileSync('db/migrations/'+name,'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;','');
      await db.exec(sql);
    }
    // Recreate the pre-native 011 table shape to exercise in-place upgrades from existing deployments.
    const legacy011=readFileSync('db/migrations/011_feed_ai_usage.sql','utf8')
      .replace("engine text NOT NULL DEFAULT 'native',", "provider text NOT NULL DEFAULT 'openclip',\n  provider_job_id text,")
      .replace('CREATE INDEX IF NOT EXISTS ai_clip_requests_user ON ai_clip_requests(user_id,created_at DESC);',
        'CREATE INDEX IF NOT EXISTS ai_clip_requests_user ON ai_clip_requests(user_id,created_at DESC);\nCREATE UNIQUE INDEX ai_clip_requests_provider_job ON ai_clip_requests(provider,provider_job_id) WHERE provider_job_id IS NOT NULL;');
    await db.exec(legacy011);
    const user=(await db.query("INSERT INTO users(google_sub,email,display_name) VALUES('legacy','legacy@example.com','Legacy') RETURNING id")).rows[0].id;
    const asset=(await db.query("INSERT INTO media_assets(owner_id,kind,object_key,mime,byte_size) VALUES($1,'source','legacy-source','video/mp4',100) RETURNING id",[user])).rows[0].id;
    const ledger=(await db.query("INSERT INTO ai_usage_ledger(user_id,action,units,idempotency_key) VALUES($1,'openclip_clip',5,'legacy-native-job') RETURNING id",[user])).rows[0].id;
    await db.query("INSERT INTO ai_clip_requests(user_id,source_asset_id,provider,provider_job_id,status,usage_ledger_id) VALUES($1,$2,'openclip','old-provider-id','processing',$3)",[user,asset,ledger]);
    await db.exec(readFileSync('db/migrations/012_native_video_clips.sql','utf8'));
    const request=(await db.query('SELECT engine,status,source_asset_id FROM ai_clip_requests WHERE user_id=$1',[user])).rows[0];
    assert.deepEqual(request,{engine:'native',status:'queued',source_asset_id:asset});
    assert.equal((await db.query("SELECT action FROM ai_usage_ledger WHERE id=$1",[ledger])).rows[0].action,'native_clip');
    await assert.rejects(db.query('SELECT provider_job_id FROM ai_clip_requests'));
  }finally{await db.close();}
});
