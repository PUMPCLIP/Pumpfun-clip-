import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {acceptsEventId} from '../lib/sse-event-state.mjs';

async function createDb(){
  const db=new PGlite();
  await db.exec(readFileSync('db/migrations/001_core.sql','utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',''));
  await db.exec(readFileSync('db/migrations/026_credit_event_replay.sql','utf8'));
  return db;
}

async function user(db,email){
  return (await db.query(
    "INSERT INTO users(google_sub,email,display_name) VALUES($1,$2,'Replay test') RETURNING id",
    [`sub:${email}`,email]
  )).rows[0].id;
}

async function event(db,userId,type,payload){
  return (await db.query(
    'INSERT INTO credit_events(user_id,event_type,payload) VALUES($1,$2,$3) RETURNING id',
    [userId,type,JSON.stringify(payload)]
  )).rows[0];
}

test('replays only events newer than Last-Event-ID in ascending order for the authenticated user',async()=>{
  const db=await createDb();
  try{
    const alice=await user(db,'alice-replay@example.invalid');
    const bob=await user(db,'bob-replay@example.invalid');
    const first=await event(db,alice,'credit_reserved',{units:5});
    const second=await event(db,alice,'credit_settled',{settlement:'consumed'});
    await event(db,bob,'credit_reserved',{units:5});
    const replay=await db.query(
      `SELECT id,event_type,payload FROM credit_events
       WHERE user_id=$1 AND id>$2 ORDER BY id ASC`,
      [alice,String(first.id)]
    );
    assert.deepEqual(replay.rows.map(row=>({id:String(row.id),type:row.event_type})),[
      {id:String(second.id),type:'credit_settled'},
    ]);
    assert.deepEqual(replay.rows[0].payload,{settlement:'consumed'});
  }finally{await db.close();}
});

test('Last-Event-ID equal to the newest event produces an empty replay and zero replays all user events',async()=>{
  const db=await createDb();
  try{
    const alice=await user(db,'alice-boundary@example.invalid');
    const first=await event(db,alice,'credit_reserved',{units:5});
    const second=await event(db,alice,'credit_settled',{settlement:'released'});
    const empty=await db.query('SELECT id FROM credit_events WHERE user_id=$1 AND id>$2 ORDER BY id',[alice,String(second.id)]);
    const all=await db.query('SELECT id FROM credit_events WHERE user_id=$1 AND id>$2 ORDER BY id',[alice,'0']);
    assert.equal(empty.rowCount,0);
    assert.deepEqual(all.rows.map(row=>String(row.id)),[String(first.id),String(second.id)]);
  }finally{await db.close();}
});

test('duplicate protection rejects replayed or out-of-order numeric event IDs',()=>{
  assert.equal(acceptsEventId('', '1'),true);
  assert.equal(acceptsEventId('10', '10'),false);
  assert.equal(acceptsEventId('10', '9'),false);
  assert.equal(acceptsEventId('10', '11'),true);
  assert.equal(acceptsEventId('10', 'event-uuid'),true);
  assert.equal(acceptsEventId('', ''),true);
});
