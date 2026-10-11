import crypto from 'node:crypto';
import {z} from 'zod';
import {db,one} from '@/lib/db';
import {mutation,jsonError} from '@/lib/auth';
import {address} from '@/lib/chain';
export const runtime='nodejs';
export async function GET(request:Request){try{const user=await mutation(request);const rows=await db.query('SELECT id,address,network,label,enabled,created_at,updated_at FROM wallet_watch_targets WHERE user_id=$1 ORDER BY created_at DESC',[user.user_id]);return Response.json(rows.rows);}catch(error){return jsonError(error,crypto.randomUUID());}}
export async function POST(request:Request){try{const user=await mutation(request);const data=z.object({address:z.string().min(32).max(50),network:z.enum(['mainnet-beta','mainnet','devnet']).default('mainnet-beta'),label:z.string().trim().max(120).default('')}).parse(await request.json().catch(()=>null));address(data.address);const row=await one<any>(`INSERT INTO wallet_watch_targets(user_id,address,network,label) VALUES($1,$2,$3,$4)
  ON CONFLICT(user_id,address,network) DO UPDATE SET label=EXCLUDED.label,enabled=true,updated_at=now() RETURNING id,address,network,label,enabled,created_at,updated_at`,[user.user_id,data.address,data.network,data.label]);return Response.json(row,{status:201});}catch(error){return jsonError(error,crypto.randomUUID());}}
