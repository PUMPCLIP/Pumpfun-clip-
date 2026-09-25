import {z} from 'zod';
import {db,one} from '@/lib/db';
import {mutation,requireUser,jsonError,ApiError} from '@/lib/auth';
import {address} from '@/lib/chain';

export const runtime='nodejs';
const provider=z.enum(['phantom','solflare','backpack','axiom','privy_embedded','manual']);
async function list(userId:string){return (await db.query('SELECT id,provider,address,label,is_default FROM payout_destinations WHERE user_id=$1 ORDER BY is_default DESC,created_at DESC',[userId])).rows;}
export async function GET(){try{return Response.json(await list((await requireUser()).user_id));}catch(e){return jsonError(e,crypto.randomUUID());}}
export async function POST(request:Request){try{const user=await mutation(request),data=z.object({provider,label:z.string().max(80).default(''),address:z.string().min(32).max(50)}).parse(await request.json());address(data.address);await db.query(`INSERT INTO payout_destinations(user_id,provider,address,label,is_default) VALUES($1,$2,$3,$4,NOT EXISTS(SELECT 1 FROM payout_destinations WHERE user_id=$1)) ON CONFLICT(user_id,address) DO UPDATE SET provider=EXCLUDED.provider,label=EXCLUDED.label,updated_at=now()`,[user.user_id,data.provider,data.address,data.label]);return Response.json(await list(user.user_id),{status:201});}catch(e){return jsonError(e,crypto.randomUUID());}}
