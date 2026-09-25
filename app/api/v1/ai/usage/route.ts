import {requireUser,jsonError} from '@/lib/auth';
import {usageSummary} from '@/lib/ai-usage';
export const runtime='nodejs';
export async function GET(){try{return Response.json(await usageSummary((await requireUser()).user_id));}catch(e){return jsonError(e,crypto.randomUUID());}}
