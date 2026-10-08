import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('readiness reports missing database and treasury configuration without opaque runtime errors',()=>{
  const keys=['APP_URL','STAGING_DOMAIN','DATABASE_URL','DATABASE_SSL','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','SOLANA_CLUSTER','PUMPCLIP_MINT','TOKEN_TREASURY','SOL_TREASURY','MEDIA_BUCKET','MEDIA_ACCESS_KEY_ID','MEDIA_SECRET_ACCESS_KEY'];
  const env={...process.env,READINESS_MODE:'core'};
  for(const key of keys)env[key]='';
  const result=spawnSync(process.execPath,['scripts/readiness.mjs'],{cwd:root,env,encoding:'utf8',timeout:15000});
  assert.equal(result.error,undefined,result.error?.message);
  assert.equal(result.status,1,result.stdout+'\n'+result.stderr);
  const report=JSON.parse(result.stdout);
  const treasury=report.results.find(item=>item.name==='Mint and treasuries');
  const database=report.results.find(item=>item.name==='PostgreSQL migrations');
  assert.equal(treasury.status,'blocked');
  assert.match(treasury.reason,/Missing PUMPCLIP_MINT, TOKEN_TREASURY, SOL_TREASURY/);
  assert.equal(database.status,'blocked');
  assert.match(database.reason,/DATABASE_URL missing/);
  assert.doesNotMatch(result.stdout,/AggregateError|Cannot read properties of undefined/);
});
