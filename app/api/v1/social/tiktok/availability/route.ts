import {requireUser,jsonError} from '@/lib/auth';
import {tiktokConfigured,tiktokDirectEnabled} from '@/lib/tiktok';
export async function GET(){try{await requireUser();return Response.json({enabled:tiktokConfigured()&&tiktokDirectEnabled()});}catch(e){return jsonError(e,crypto.randomUUID());}}
