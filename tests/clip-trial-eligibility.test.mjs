import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';

const source=readFileSync('lib/clip-trial-eligibility.ts','utf8');
const compiled=ts.transpile(source,{module:ts.ModuleKind.ESNext});
const rules=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('only a fully free native clip reservation bypasses wallet eligibility',()=>{
  assert.equal(rules.canUseWalletlessTrialClip(10,false),true);
  assert.equal(rules.canUseWalletlessTrialClip(5,false),true);
  assert.equal(rules.canUseWalletlessTrialClip(4,false),false);
  assert.equal(rules.canUseWalletlessTrialClip(10,true),false);
  assert.equal(rules.isFreeTrialOnlyNativeClipReservation({
    action:'native_clip',units:5,metadata:{freeUnits:5,paidUnits:0,planCredits:false},
  }),true);
  assert.equal(rules.isFreeTrialOnlyNativeClipReservation({
    action:'native_clip',units:5,metadata:{freeUnits:4,paidUnits:1,planCredits:false},
  }),false);
  assert.equal(rules.isFreeTrialOnlyNativeClipReservation({
    action:'native_clip',units:5,metadata:{freeUnits:0,paidUnits:5,planCredits:true},
  }),false);
  assert.equal(rules.isFreeTrialOnlyNativeClipReservation({
    action:'highlight_analysis',units:5,metadata:{freeUnits:5,paidUnits:0},
  }),false);
});

test('trial availability query excludes active plans and clips with fewer than five free units',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`
      CREATE TABLE ai_usage_accounts(user_id uuid PRIMARY KEY,free_units integer NOT NULL DEFAULT 10);
      CREATE TABLE clip_plans(user_id uuid PRIMARY KEY,status text NOT NULL,period_start timestamptz,period_end timestamptz);
    `);
    const trialUser='00000000-0000-0000-0000-000000000101';
    const paidUser='00000000-0000-0000-0000-000000000102';
    const lowTrialUser='00000000-0000-0000-0000-000000000103';
    await db.query('INSERT INTO ai_usage_accounts(user_id) VALUES($1)',[trialUser]);
    await db.query('INSERT INTO ai_usage_accounts(user_id) VALUES($1)',[paidUser]);
    await db.query('INSERT INTO clip_plans(user_id,status,period_start,period_end) VALUES($1,\'active\',now()-interval \'1 day\',now()+interval \'1 year\')',[paidUser]);
    await db.query('INSERT INTO ai_usage_accounts(user_id,free_units) VALUES($1,4)',[lowTrialUser]);

    async function canUseTrial(userId){
      const row=(await db.query(rules.FREE_TRIAL_AVAILABILITY_SQL,[userId])).rows[0];
      return rules.canUseWalletlessTrialClip(Number(row.free_units),row.has_active_plan);
    }
    assert.equal(await canUseTrial(trialUser),true);
    assert.equal(await canUseTrial(paidUser),false);
    assert.equal(await canUseTrial(lowTrialUser),false);
    assert.equal(await canUseTrial('00000000-0000-0000-0000-000000000104'),false);
  }finally{await db.close();}
});

test('clip queue and source upload routes apply the trial-only wallet bypass',()=>{
  const clipRoute=readFileSync('app/api/v1/ai/clips/route.ts','utf8');
  const uploadRoute=readFileSync('app/api/v1/uploads/route.ts','utf8');
  const clipClient=readFileSync('app/dashboard/clip-engine.tsx','utf8');
  assert.ok(/hasAvailableFreeTrialNativeClip/.test(clipRoute),'clip submission must check available free-trial units');
  assert.ok(/isFreeTrialOnlyNativeClipReservation/.test(clipRoute),'paid or mixed allocations must not bypass wallet eligibility');
  assert.ok(/purpose==='native_clip'/.test(uploadRoute),'walletless upload bypass must be native-clip-only');
  assert.ok(/hasAvailableFreeTrialNativeClip/.test(uploadRoute),'source upload bypass must require free-trial availability');
  assert.ok(/form\.set\('purpose',\s*'native_clip'\)/.test(clipClient),'native source uploads must carry the explicit purpose');
});
