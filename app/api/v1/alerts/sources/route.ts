import crypto from 'node:crypto';
import {z} from 'zod';
import {db,one} from '@/lib/db';
import {mutation,jsonError} from '@/lib/auth';
export const runtime='nodejs';
const provider=z.enum(['kick','twitch','youtube','custom']);
export async function GET(request:Request){try{const user=await mutation(request);const rows=await db.query('SELECT id,provider,external_id,display_name,status,metadata,last_event_at,created_at FROM stream_sources WHERE owner_id=$1 ORDER BY created_at DESC',[user.user_id]);return Response.json(rows.rows);}catch(error){return jsonError(error,crypto.randomUUID());}}
export async function POST(request:Request){try{const user=await mutation(request);const data=z.object({provider,externalId:z.string().trim().min(1).max(240),displayName:z.string().trim().max(160).default(''),metadata:z.record(z.string(),z.unknown()).default({})}).parse(await request.json().catch(()=>null));const row=await one<any>(`INSERT INTO stream_sources(owner_id,provider,external_id,display_name,metadata) VALUES($1,$2,$3,$4,$5)
  ON CONFLICT(provider,external_id) DO UPDATE SET owner_id=EXCLUDED.owner_id,display_name=EXCLUDED.display_name,metadata=EXCLUDED.metadata,status='active',updated_at=now() RETURNING id,provider,external_id,display_name,status,metadata,last_event_at,created_at`,[user.user_id,data.provider,data.externalId,data.displayName,JSON.stringify(data.metadata)]);return Response.json(row,{status:201});}catch(error){return jsonError(error,crypto.randomUUID());}}
