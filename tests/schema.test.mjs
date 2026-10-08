import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('database rejects wallet reuse, duplicate clip hashes and overreserved escrow',async()=>{
  const db=new PGlite();
  try {
    for(const name of ['001_core.sql','002_studio.sql','003_rewards.sql','004_ai.sql','005_social.sql','006_tiktok.sql','007_youtube_uploads.sql','008_publications.sql','009_proof_and_operations.sql','010_identity_and_payouts.sql','011_feed_ai_usage.sql','012_native_video_clips.sql','013_creator_workflow.sql','014_worker_leases.sql','016_supabase_auth_identity.sql','017_public_profiles_pumpfun.sql','019_user_profiles.sql','020_profiles_social_activity.sql']) {
      const sql=readFileSync('db/migrations/'+name,'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;','');
      await db.exec(sql);
    }
    const u1=(await db.query("INSERT INTO users(google_sub,email,display_name) VALUES('g1','one@example.com','One') RETURNING id")).rows[0].id;
    const u2=(await db.query("INSERT INTO users(google_sub,email,display_name) VALUES('g2','two@example.com','Two') RETURNING id")).rows[0].id;
    await db.query("UPDATE users SET public_handle='First_Handle' WHERE id=$1",[u1]);
    await db.query('INSERT INTO profile_follows(follower_id,followed_id) VALUES($1,$2)',[u2,u1]);
    await assert.rejects(db.query('INSERT INTO profile_follows(follower_id,followed_id) VALUES($1,$2)',[u1,u1]));
    await assert.rejects(db.query('INSERT INTO profile_follows(follower_id,followed_id) VALUES($1,$2)',[u2,u1]));
    assert.equal((await db.query('SELECT count(*)::int AS n FROM profile_follows WHERE followed_id=$1',[u1])).rows[0].n,1);
    await assert.rejects(db.query("UPDATE users SET public_handle='first_handle' WHERE id=$1",[u2]));
    assert.equal((await db.query('SELECT display_name_customized FROM users WHERE id=$1',[u1])).rows[0].display_name_customized,false);
    await db.query("UPDATE users SET display_name='Custom Name',display_name_customized=true WHERE id=$1",[u1]);
    await db.query("UPDATE users SET display_name=CASE WHEN users.display_name_customized THEN users.display_name ELSE $2 END WHERE id=$1",[u1,'Provider Name']);
    assert.equal((await db.query('SELECT display_name FROM users WHERE id=$1',[u1])).rows[0].display_name,'Custom Name');
    await db.query('UPDATE users SET supabase_user_id=$2 WHERE id=$1',[u1,'supabase-user-1']);
    await assert.rejects(db.query('UPDATE users SET supabase_user_id=$2 WHERE id=$1',[u2,'supabase-user-1']));
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
    for(const name of ['020_profiles_social_activity.sql','019_user_profiles.sql','017_public_profiles_pumpfun.sql','016_supabase_auth_identity.sql','014_worker_leases.sql','013_creator_workflow.sql','012_native_video_clips.sql','011_feed_ai_usage.sql','009_proof_and_operations.sql','008_publications.sql','007_youtube_uploads.sql','006_tiktok.sql','005_social.sql','004_ai.sql','003_rewards.sql','002_studio.sql','001_core.sql']) {
      if(name==='020_profiles_social_activity.sql'||name==='019_user_profiles.sql'||name==='017_public_profiles_pumpfun.sql'||name==='016_supabase_auth_identity.sql') await db.exec(readFileSync('db/migrations/down/'+name,'utf8'));
      else if(name==='014_worker_leases.sql') await db.exec('ALTER TABLE studio_jobs DROP COLUMN lease_id, DROP COLUMN lease_expires_at; ALTER TABLE ai_jobs DROP COLUMN lease_id, DROP COLUMN lease_expires_at; ALTER TABLE ai_clip_requests DROP COLUMN lease_id, DROP COLUMN lease_expires_at; DROP TABLE IF EXISTS payout_destinations;');
      else if(name==='013_creator_workflow.sql') await db.exec('DROP TABLE campaign_disputes, campaign_messages, review_comments, submission_versions;');
      else await db.exec(readFileSync('db/migrations/down/'+name,'utf8'));
    }
    const tables=await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('users','campaigns','studio_jobs')");
    assert.equal(tables.rows.length,0);
  } finally {await db.close();}
});


test('account anonymization removes login and social identity but preserves campaign and reward history',async()=>{
  const db=new PGlite();
  try{
    for(const name of ['001_core.sql','002_studio.sql','003_rewards.sql','004_ai.sql','005_social.sql','006_tiktok.sql','007_youtube_uploads.sql','008_publications.sql','009_proof_and_operations.sql','010_identity_and_payouts.sql','011_feed_ai_usage.sql','012_native_video_clips.sql','013_creator_workflow.sql','014_worker_leases.sql','016_supabase_auth_identity.sql','017_public_profiles_pumpfun.sql','019_user_profiles.sql','020_profiles_social_activity.sql']) {
      await db.exec(readFileSync('db/migrations/'+name,'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',''));
    }
    const owner=(await db.query("INSERT INTO users(google_sub,email,display_name,public_handle) VALUES('owner-auth','owner@example.com','Owner','owner') RETURNING id")).rows[0].id;
    const user=(await db.query("INSERT INTO users(google_sub,email,display_name,public_handle,roles,social_links,avatar_key) VALUES('clipper-auth','clipper@example.com','Clipper','clipper',ARRAY['clipper'],'{\"pumpfun\":\"https://pump.fun/clipper\"}'::jsonb,'avatars/private.webp') RETURNING id")).rows[0].id;
    await db.query('INSERT INTO profile_follows(follower_id,followed_id) VALUES($1,$2)',[user,owner]);
    const campaign=(await db.query('INSERT INTO campaigns(streamer_id,title) VALUES($1,$2) RETURNING id',[owner,'Retained campaign'])).rows[0].id;
    const asset=(await db.query("INSERT INTO media_assets(owner_id,kind,object_key,mime,byte_size) VALUES($1,'clip','retained-clip','video/mp4',100) RETURNING id",[user])).rows[0].id;
    const submission=(await db.query('INSERT INTO submissions(campaign_id,clipper_id,asset_id,media_sha256,state) VALUES($1,$2,$3,$4,$5) RETURNING id',[campaign,user,asset,'f'.repeat(64),'approved'])).rows[0].id;
    await db.query('INSERT INTO reward_awards(submission_id,campaign_id,clipper_id,recipient,lamports) VALUES($1,$2,$3,$4,$5)',[submission,campaign,user,'wallet-address','1000000000']);
    const wallet=(await db.query("INSERT INTO wallets(user_id,address,network) VALUES($1,'clipper-wallet','devnet') RETURNING id",[user])).rows[0].id;
    await db.query('INSERT INTO token_gate_checks(user_id,wallet_id,mint,network,balance_raw,slot) VALUES($1,$2,$3,$4,$5,$6)',[user,wallet,'mint','devnet','10',1]);
    await db.query(`INSERT INTO wallet_challenges(user_id,address,nonce_hash,message,expires_at) VALUES($1,$2,$3,$4,now()+interval '5 minutes')`,[user,'clipper-wallet','nonce-hash','sign this']);
    await db.query(`INSERT INTO sessions(user_id,token_hash,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 day')`,[user,'token-hash','csrf-hash']);
    await db.query("INSERT INTO social_connections(user_id,provider,refresh_token_cipher) VALUES($1,'youtube','encrypted-token')",[user]);
    await db.query("INSERT INTO social_oauth_states(state_hash,user_id,verifier) VALUES('oauth-state',$1,'verifier')",[user]);
    await db.query("INSERT INTO social_posts(user_id,asset_id,provider,remote_id,url) VALUES($1,$2,'youtube','remote-id','https://youtube.com/watch?v=clip')",[user,asset]);
    await db.query("INSERT INTO tiktok_drafts(user_id,asset_id) VALUES($1,$2)",[user,asset]);
    await db.query("INSERT INTO youtube_uploads(user_id,asset_id,byte_size) VALUES($1,$2,100)",[user,asset]);
    await db.query("INSERT INTO payout_destinations(user_id,provider,address) VALUES($1,'manual','clipper-wallet')",[user]);

    await db.query('DELETE FROM profile_follows WHERE follower_id=$1 OR followed_id=$1',[user]);
    await db.query('DELETE FROM sessions WHERE user_id=$1',[user]);
    await db.query('DELETE FROM social_oauth_states WHERE user_id=$1',[user]);
    await db.query('DELETE FROM social_connections WHERE user_id=$1',[user]);
    await db.query('DELETE FROM social_posts WHERE user_id=$1',[user]);
    await db.query('DELETE FROM tiktok_drafts WHERE user_id=$1',[user]);
    await db.query('DELETE FROM youtube_uploads WHERE user_id=$1',[user]);
    await db.query('DELETE FROM payout_destinations WHERE user_id=$1',[user]);
    await db.query('DELETE FROM token_gate_checks WHERE user_id=$1',[user]);
    await db.query('DELETE FROM wallet_challenges WHERE user_id=$1',[user]);
    await db.query('DELETE FROM wallets WHERE user_id=$1',[user]);
    await db.query("UPDATE users SET email='deleted+'||id::text||'@deleted.invalid',google_sub=NULL,supabase_user_id=NULL,privy_user_id=NULL,auth_provider='deleted',email_verified=false,display_name='Deleted user',display_name_customized=true,roles='{}',public_handle=NULL,social_links='{}'::jsonb,avatar_key=NULL,avatar_updated_at=NULL,deleted_at=now(),updated_at=now() WHERE id=$1",[user]);

    const tombstone=(await db.query('SELECT email,google_sub,display_name,public_handle,social_links,avatar_key,deleted_at,roles FROM users WHERE id=$1',[user])).rows[0];
    assert.equal(tombstone.email,`deleted+${user}@deleted.invalid`);
    assert.equal(tombstone.google_sub,null);
    assert.equal(tombstone.display_name,'Deleted user');
    assert.equal(tombstone.public_handle,null);
    assert.deepEqual(tombstone.social_links,{});
    assert.equal(tombstone.avatar_key,null);
    assert.ok(tombstone.deleted_at);
    assert.deepEqual(tombstone.roles,[]);
    for(const table of ['profile_follows','sessions','social_oauth_states','social_connections','social_posts','tiktok_drafts','youtube_uploads','payout_destinations','token_gate_checks','wallet_challenges','wallets']) {
      const rows=await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${table==='profile_follows'?'follower_id=$1 OR followed_id=$1':'user_id=$1'}`,[user]);
      assert.equal(rows.rows[0].n,0,`${table} should be removed`);
    }
    assert.equal((await db.query('SELECT count(*)::int AS n FROM campaigns WHERE id=$1',[campaign])).rows[0].n,1);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM submissions WHERE id=$1',[submission])).rows[0].n,1);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM reward_awards WHERE clipper_id=$1',[user])).rows[0].n,1);
  }finally{await db.close();}
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

test('worker leases recover stale jobs and prevent stale settlement or double refunds',async()=>{
  const db=new PGlite();
  try{
    for(const name of ['001_core.sql','002_studio.sql','003_rewards.sql','004_ai.sql','005_social.sql','006_tiktok.sql','007_youtube_uploads.sql','008_publications.sql','009_proof_and_operations.sql','010_identity_and_payouts.sql','011_feed_ai_usage.sql','012_native_video_clips.sql','013_creator_workflow.sql','014_worker_leases.sql','016_supabase_auth_identity.sql']) await db.exec(readFileSync('db/migrations/'+name,'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',''));
    const user=(await db.query("INSERT INTO users(google_sub,email,display_name) VALUES('lease','lease@example.com','Lease') RETURNING id")).rows[0].id;
    const asset=(await db.query("INSERT INTO media_assets(owner_id,kind,object_key,mime,byte_size) VALUES($1,'source','lease-source','video/mp4',100) RETURNING id",[user])).rows[0].id;
    await db.query("INSERT INTO ai_usage_accounts(user_id,balance_units) VALUES($1,5)",[user]);
    const ledger=(await db.query("INSERT INTO ai_usage_ledger(user_id,action,units,status,idempotency_key,metadata) VALUES($1,'native_clip',5,'reserved','lease-key',$2) RETURNING id",[user,JSON.stringify({freeUnits:0,paidUnits:5})])).rows[0].id;
    const request=(await db.query("INSERT INTO ai_clip_requests(user_id,source_asset_id,usage_ledger_id,status,engine,lease_id,lease_expires_at) VALUES($1,$2,$3,'processing','native','00000000-0000-0000-0000-000000000001',now()-interval '1 minute') RETURNING id",[user,asset,ledger])).rows[0].id;
    await db.query("UPDATE ai_clip_requests SET status='queued',lease_id=NULL,lease_expires_at=NULL WHERE status='processing' AND lease_expires_at<now()");
    assert.equal((await db.query("UPDATE ai_clip_requests SET status='processing',lease_id='00000000-0000-0000-0000-000000000002' WHERE id=$1 AND status='queued' RETURNING id",[request])).rowCount,1);
    assert.equal((await db.query("UPDATE ai_clip_requests SET status='failed' WHERE id=$1 AND lease_id='00000000-0000-0000-0000-000000000001'",[request])).rowCount,0);
    assert.equal((await db.query("UPDATE ai_usage_ledger SET status='released' WHERE id=$1 AND status='reserved'",[ledger])).rowCount,1);
    assert.equal((await db.query("UPDATE ai_usage_ledger SET status='released' WHERE id=$1 AND status='reserved'",[ledger])).rowCount,0);
  } finally {await db.close();}
});
