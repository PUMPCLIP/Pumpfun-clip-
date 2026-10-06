import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const databaseUrl=process.env.DATABASE_URL||'';
const ssl=process.env.DATABASE_SSL==='disable'?undefined:(databaseUrl?{rejectUnauthorized:false}:undefined);
const client = new pg.Client({connectionString:databaseUrl,ssl,connectionTimeoutMillis:10000});
await client.connect();
try {
  await client.query('SELECT pg_advisory_lock(hashtextextended($1,0))', ['pumpclip-schema-migrations']);
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const migrations=fs.readdirSync('db/migrations').filter(name=>/^\d+_.+\.sql$/.test(name)).sort();
  for (const name of migrations) {
    const found = await client.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name]);
    if (found.rowCount) continue;
    await client.query('BEGIN');
    try {
      await client.query(fs.readFileSync(path.join('db/migrations', name), 'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
      await client.query('COMMIT');
      console.log('Applied', name);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  }
} finally {
  await client.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', ['pumpclip-schema-migrations']).catch(()=>{});
  await client.end();
}
