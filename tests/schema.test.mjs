import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('database rejects wallet reuse, duplicate clip hashes and overreserved escrow',async()=>{
  const db=new PGlite();
  try {
    for(const name of ['001_core.sql','002_studio.sql','003_rewards.sql','004_ai.sql','005_social.sql','006_tiktok.sql','007_youtube_uploads.sql','008_publications.sql']) {
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
    await db.query('INSERT INTO tiktok_drafts(user_id,asset_id) VALUES($1,$2)',[u2,asset]);
    await assert.rejects(db.query('INSERT INTO tiktok_drafts(user_id,asset_id) VALUES($1,$2)',[u2,asset]));
    await db.query('INSERT INTO youtube_uploads(user_id,asset_id,byte_size) VALUES($1,$2,100)',[u2,asset]);
    await assert.rejects(db.query('INSERT INTO youtube_uploads(user_id,asset_id,byte_size) VALUES($1,$2,100)',[u2,asset]));
    await db.query("INSERT INTO social_publications(user_id,asset_id,provider) VALUES($1,$2,'x')",[u2,asset]);
    await assert.rejects(db.query("INSERT INTO social_publications(user_id,asset_id,provider) VALUES($1,$2,'x')",[u2,asset]));
    for(const name of ['008_publications.sql','007_youtube_uploads.sql','006_tiktok.sql','005_social.sql','004_ai.sql','003_rewards.sql','002_studio.sql','001_core.sql']) await db.exec(readFileSync('db/migrations/down/'+name,'utf8'));
    const tables=await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('users','campaigns','studio_jobs')");
    assert.equal(tables.rows.length,0);
  } finally {await db.close();}
});
