import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('wallet login challenge can be stored before a user exists',async()=>{
  const db=new PGlite();
  try{
    await db.exec(readFileSync('db/migrations/001_core.sql','utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',''));
    await db.exec(readFileSync('db/migrations/028_wallet_login_challenges.sql','utf8'));
    const result=await db.query(
      `INSERT INTO wallet_challenges(user_id,address,nonce_hash,message,expires_at)
       VALUES(NULL,'11111111111111111111111111111111','nonce-hash','PUMPCLIP wallet sign-in',now()+interval '5 minutes')
       RETURNING id,user_id,address`,
    );
    assert.equal(result.rows.length,1);
    assert.equal(result.rows[0].user_id,null);
    assert.equal(result.rows[0].address,'11111111111111111111111111111111');
  }finally{await db.close();}
});
