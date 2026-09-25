import pg from 'pg';
import {Connection,PublicKey} from '@solana/web3.js';
import {S3Client,HeadBucketCommand} from '@aws-sdk/client-s3';
import {spawnSync} from 'node:child_process';
const results=[];
async function check(name,fn){try{await fn();results.push({name,status:'ok'});}catch(e){results.push({name,status:'blocked',reason:String(e.message||e)});}}
await check('HTTPS origin',()=>{if(!process.env.APP_URL?.startsWith('https://'))throw new Error('APP_URL must be HTTPS');});
await check('Google OAuth',()=>{if(!process.env.GOOGLE_CLIENT_ID||!process.env.GOOGLE_CLIENT_SECRET)throw new Error('Client credentials missing');});
await check('AI provider',()=>{if(!process.env.OPENAI_API_KEY)throw new Error('OPENAI_API_KEY missing');});
await check('YouTube encryption',()=>{if(Buffer.from(process.env.SOCIAL_TOKEN_KEY||'','base64').length!==32)throw new Error('SOCIAL_TOKEN_KEY must be 32 bytes');});
await check('TikTok app',()=>{if(!process.env.TIKTOK_CLIENT_KEY||!process.env.TIKTOK_CLIENT_SECRET)throw new Error('TikTok Login Kit and video.upload credentials missing');});
await check('Devnet RPC',async()=>{if(process.env.SOLANA_CLUSTER!=='devnet')throw new Error('Only devnet is supported');const c=new Connection(process.env.SOLANA_RPC_URL||'https://api.devnet.solana.com');if(await c.getGenesisHash()!=='GH7ome3EiwEr7tu9JuTh2dpYWBJK3z69Xm1ZE3MEE6JC')throw new Error('Wrong cluster');});
await check('Mint and treasuries',()=>{for(const name of ['PUMPCLIP_MINT','TOKEN_TREASURY','SOL_TREASURY'])new PublicKey(process.env[name]);});
await check('PostgreSQL migrations',async()=>{const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();try{const r=await db.query('SELECT name FROM schema_migrations');for(const name of ['001_core.sql','002_studio.sql','003_rewards.sql','004_ai.sql','005_social.sql','006_tiktok.sql','007_youtube_uploads.sql'])if(!r.rows.some(row=>row.name===name))throw new Error('Missing '+name);}finally{await db.end();}});
await check('Private media bucket',async()=>{if(!process.env.MEDIA_BUCKET)throw new Error('MEDIA_BUCKET missing');const client=new S3Client({region:process.env.MEDIA_REGION||'auto',endpoint:process.env.MEDIA_ENDPOINT||undefined,forcePathStyle:!!process.env.MEDIA_ENDPOINT,credentials:process.env.MEDIA_ACCESS_KEY_ID&&process.env.MEDIA_SECRET_ACCESS_KEY?{accessKeyId:process.env.MEDIA_ACCESS_KEY_ID,secretAccessKey:process.env.MEDIA_SECRET_ACCESS_KEY}:undefined});await client.send(new HeadBucketCommand({Bucket:process.env.MEDIA_BUCKET}));});
await check('FFmpeg',()=>{if(spawnSync('ffmpeg',['-version']).status!==0||spawnSync('ffprobe',['-version']).status!==0)throw new Error('FFmpeg and ffprobe required');});
console.log(JSON.stringify(results,null,2));if(results.some(r=>r.status==='blocked'))process.exitCode=1;
