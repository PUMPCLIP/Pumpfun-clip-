import pg from 'pg';
if (process.env.ALLOW_DEV_AUTH !== 'true' || process.env.SOLANA_CLUSTER !== 'devnet') throw new Error('Seed only on explicit devnet development configuration');
const client = new pg.Client({connectionString: process.env.DATABASE_URL});
await client.connect();
try {
  await client.query("INSERT INTO users (google_sub,email,display_name,roles) VALUES ('development-streamer','streamer@pumpclip.local','Demo Streamer',ARRAY['streamer']) ON CONFLICT (google_sub) DO NOTHING");
  await client.query("INSERT INTO users (google_sub,email,display_name,roles) VALUES ('development-clipper','clipper@pumpclip.local','Demo Clipper',ARRAY['clipper']) ON CONFLICT (google_sub) DO NOTHING");
  console.log('Seeded development accounts. Use /api/v1/auth/dev only on localhost with ALLOW_DEV_AUTH=true.');
} finally { await client.end(); }
