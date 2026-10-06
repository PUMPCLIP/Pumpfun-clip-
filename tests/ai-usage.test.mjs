import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const migrations=['001_core.sql','002_studio.sql','003_rewards.sql','004_ai.sql','005_social.sql','006_tiktok.sql','007_youtube_uploads.sql','008_publications.sql','009_proof_and_operations.sql','010_identity_and_payouts.sql','011_feed_ai_usage.sql','012_native_video_clips.sql','013_creator_workflow.sql','014_worker_leases.sql','016_supabase_auth_identity.sql'];
async function createDb(){
  const db=new PGlite();
  for(const name of migrations)await db.exec(readFileSync(`db/migrations/${name}`,'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',''));
  return db;
}
async function createTestUser(db,email){
  return (await db.query("INSERT INTO users(google_sub,email,display_name,auth_provider,email_verified) VALUES(NULL,$1,'Pipeline test','pipeline_test',false) RETURNING id",[email])).rows[0].id;
}
async function reserveNativeClip(db,userId,key){
  await db.query('BEGIN');
  try{
    const existing=(await db.query('SELECT * FROM ai_usage_ledger WHERE user_id=$1 AND idempotency_key=$2',[userId,key])).rows[0];
    if(existing){await db.query('COMMIT');return existing;}
    await db.query('INSERT INTO ai_usage_accounts(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING',[userId]);
    const account=(await db.query('SELECT free_units,balance_units FROM ai_usage_accounts WHERE user_id=$1 FOR UPDATE',[userId])).rows[0];
    const units=5,available=Number(account.free_units)+Number(account.balance_units);
    assert.ok(available>=units,'five credits must be available before queueing a clip');
    const free=Math.min(Number(account.free_units),units),paid=units-free;
    await db.query('UPDATE ai_usage_accounts SET free_units=free_units-$2,balance_units=balance_units-$3 WHERE user_id=$1',[userId,free,paid]);
    const ledger=(await db.query(`INSERT INTO ai_usage_ledger(user_id,action,units,status,idempotency_key,metadata)
      VALUES($1,'native_clip',$2,'reserved',$3,$4) RETURNING *`,[userId,units,key,JSON.stringify({freeUnits:free,paidUnits:paid})])).rows[0];
    await db.query('COMMIT');return ledger;
  }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
async function settle(db,ledgerId,status){
  await db.query('BEGIN');
  try{
    const ledger=(await db.query("SELECT * FROM ai_usage_ledger WHERE id=$1 AND status='reserved' FOR UPDATE",[ledgerId])).rows[0];
    if(!ledger){await db.query('COMMIT');return;}
    if(status==='consumed')await db.query('UPDATE ai_usage_accounts SET consumed_units=consumed_units+$2 WHERE user_id=$1',[ledger.user_id,ledger.units]);
    else await db.query('UPDATE ai_usage_accounts SET free_units=free_units+$2,balance_units=balance_units+$3 WHERE user_id=$1',[ledger.user_id,Number(ledger.metadata.freeUnits),Number(ledger.metadata.paidUnits)]);
    await db.query('UPDATE ai_usage_ledger SET status=$2 WHERE id=$1 AND status=\'reserved\'',[ledgerId,status]);
    await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}

test('native clip reservation consumes exactly five units, idempotently settles, and releases failed reservations once',async()=>{
  const db=await createDb();
  try{
    const userId=await createTestUser(db,'native-clip-smoke@example.invalid');
    await db.query('INSERT INTO ai_usage_accounts(user_id,free_units,balance_units) VALUES($1,5,0)',[userId]);
    const ledger=await reserveNativeClip(db,userId,'pipeline-smoke:usage:asset-clip');
    assert.equal(Number(ledger.units),5);
    assert.equal(ledger.action,'native_clip');
    assert.equal(ledger.status,'reserved');
    assert.deepEqual(ledger.metadata,{freeUnits:5,paidUnits:0});
    let account=(await db.query('SELECT free_units,balance_units,consumed_units FROM ai_usage_accounts WHERE user_id=$1',[userId])).rows[0];
    assert.deepEqual(account,{free_units:0,balance_units:0,consumed_units:0});
    const repeated=await reserveNativeClip(db,userId,'pipeline-smoke:usage:asset-clip');
    assert.equal(repeated.id,ledger.id);
    await settle(db,ledger.id,'consumed');
    await settle(db,ledger.id,'consumed');
    account=(await db.query('SELECT free_units,balance_units,consumed_units FROM ai_usage_accounts WHERE user_id=$1',[userId])).rows[0];
    assert.deepEqual(account,{free_units:0,balance_units:0,consumed_units:5});
    assert.equal((await db.query('SELECT status FROM ai_usage_ledger WHERE id=$1',[ledger.id])).rows[0].status,'consumed');

    const failedUser=await createTestUser(db,'native-clip-failure@example.invalid');
    await db.query('INSERT INTO ai_usage_accounts(user_id,free_units,balance_units) VALUES($1,5,0)',[failedUser]);
    const failed=await reserveNativeClip(db,failedUser,'pipeline-smoke:usage:failed-clip');
    await settle(db,failed.id,'released');
    await settle(db,failed.id,'released');
    const refunded=(await db.query('SELECT free_units,balance_units,consumed_units FROM ai_usage_accounts WHERE user_id=$1',[failedUser])).rows[0];
    assert.deepEqual(refunded,{free_units:5,balance_units:0,consumed_units:0});
    assert.equal((await db.query('SELECT status FROM ai_usage_ledger WHERE id=$1',[failed.id])).rows[0].status,'released');
  }finally{await db.close();}
});
