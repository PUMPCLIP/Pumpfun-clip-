import {requireUser,jsonError} from '@/lib/auth';
import {instagramPages} from '@/lib/instagram';
export async function GET(){try{const user=await requireUser(),pages=await instagramPages(user.user_id);return Response.json(pages.map(({pageId,name,igId})=>({pageId,name,igId})));}catch(e){return jsonError(e,crypto.randomUUID());}}
