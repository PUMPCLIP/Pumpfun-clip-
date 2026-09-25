import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
test('reward reservations cannot overspend a campaign and each submission receives one award',async()=>{
 const db=new PGlite();
 try{
  for(const file of ['001_core.sql','003_rewards.sql'])await db.exec(readFileSync('db/migrations/'+file,'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',''));
  const user=(await db.query("INSERT INTO users(google_sub,email,display_name) VALUES('a','a@b.co','A') RETURNING id")).rows[0].id;
  const campaign=(await db.query('INSERT INTO campaigns(streamer_id,title) VALUES($1,$2) RETURNING id',[user,'A campaign'])).rows[0].id;
  await db.query('INSERT INTO escrow_accounts(campaign_id,funded_lamports) VALUES($1,100)',[campaign]);
  const submission=(await db.query('INSERT INTO submissions(campaign_id,clipper_id,media_sha256) VALUES($1,$2,$3) RETURNING id',[campaign,user,'a'.repeat(64)])).rows[0].id;
  await db.query('UPDATE escrow_accounts SET reserved_lamports=60 WHERE campaign_id=$1',[campaign]);
  await db.query('INSERT INTO reward_awards(submission_id,campaign_id,clipper_id,recipient,lamports) VALUES($1,$2,$3,$4,60)',[submission,campaign,user,'recipient']);
  await assert.rejects(db.query('UPDATE escrow_accounts SET reserved_lamports=110 WHERE campaign_id=$1',[campaign]));
  await assert.rejects(db.query('INSERT INTO reward_awards(submission_id,campaign_id,clipper_id,recipient,lamports) VALUES($1,$2,$3,$4,60)',[submission,campaign,user,'recipient']));
  await db.query('UPDATE escrow_accounts SET reserved_lamports=0,paid_lamports=60 WHERE campaign_id=$1',[campaign]);
  const balances=(await db.query('SELECT funded_lamports,reserved_lamports,paid_lamports FROM escrow_accounts WHERE campaign_id=$1',[campaign])).rows[0];
  assert.equal(Number(balances.funded_lamports),100);assert.equal(Number(balances.paid_lamports),60);
 }finally{await db.close();}
});
