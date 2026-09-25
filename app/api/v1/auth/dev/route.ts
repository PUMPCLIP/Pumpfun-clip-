import {createSession,jsonError,ApiError} from '@/lib/auth';
import {one} from '@/lib/db';
import {config} from '@/lib/config';
export async function POST(request:Request) {
  try {
    if(process.env.ALLOW_DEV_AUTH!=='true' || config.cluster!=='devnet' || !new URL(config.appUrl).hostname.match(/^(localhost|127\.0\.0\.1)$/)) throw new ApiError('NOT_FOUND',404);
    if(request.headers.get('origin')!==config.appUrl) throw new ApiError('INVALID_ORIGIN',403);
    const {role}=await request.json();
    if(role!=='streamer' && role!=='clipper') throw new ApiError('INVALID_ROLE');
    const user=await one<{id:string}>('SELECT id FROM users WHERE google_sub=$1',['development-'+role]);
    if(!user) throw new ApiError('SEED_REQUIRED',503);
    await createSession(user.id); return Response.json({ok:true,development:true});
  } catch(e) {return jsonError(e,crypto.randomUUID());}
}
