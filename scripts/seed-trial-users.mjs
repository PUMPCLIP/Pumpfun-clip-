import pg from 'pg';
const {Client}=pg;
if(process.env.SOLANA_CLUSTER!=='devnet') throw new Error('Trial fixtures are Devnet-only. Set SOLANA_CLUSTER=devnet.');
if(process.env.ALLOW_DEV_AUTH!=='true') throw new Error('Set ALLOW_DEV_AUTH=true before seeding test users.');
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const ssl=process.env.DATABASE_SSL==='disable'?undefined:{rejectUnauthorized:false};
const client=new Client({connectionString:process.env.DATABASE_URL,ssl});
const prefix=process.env.TEST_TRIAL_PREFIX||'trial-fixture';
const rows=[
  ['new','New Trial User',10,0],
  ['started','Started Trial User',5,5],
  ['exhausted','Exhausted Trial User',0,10],
  ['returning','Returning Trial User',0,10],
];
await client.connect();
try{
  for(const [slug,name,freeUnits,consumedUnits] of rows){
    const email=`${prefix}-${slug}@pumpclip.local`,googleSub=`${prefix}-${slug}`;
    const user=(await client.query(`INSERT INTO users(google_sub,email,display_name,roles) VALUES($1,$2,$3,ARRAY['clipper']) ON CONFLICT(google_sub) DO UPDATE SET email=EXCLUDED.email,display_name=EXCLUDED.display_name RETURNING id,email`,[googleSub,email,name])).rows[0];
    await client.query(`INSERT INTO ai_usage_accounts(user_id,free_units,balance_units,consumed_units) VALUES($1,$2,0,$3) ON CONFLICT(user_id) DO UPDATE SET free_units=EXCLUDED.free_units,balance_units=0,consumed_units=EXCLUDED.consumed_units,updated_at=now()`,[user.id,freeUnits,consumedUnits]);
    console.log(JSON.stringify({userId:user.id,email:user.email,freeUnits,consumedUnits}));
  }
  console.log('Seeded trial fixtures. No paid plan or blockchain transaction was created.');
}finally{await client.end();}
