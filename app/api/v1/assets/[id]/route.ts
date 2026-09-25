import {getMedia} from '@/lib/storage';
import {one} from '@/lib/db';
import {session,ApiError,jsonError} from '@/lib/auth';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const user=await session(),{id}=await params;
    const asset=await one<any>('SELECT * FROM media_assets WHERE id=$1',[id]);
    if(!asset) throw new ApiError('NOT_FOUND',404);
    const publicFeedAccess=asset.kind==='clip' && await one("SELECT 1 FROM submissions WHERE asset_id=$1 AND state IN ('approved','published','rewarded')",[id]);
    if(!publicFeedAccess && !user) throw new ApiError('SIGN_IN_REQUIRED',401);
    if(!publicFeedAccess && asset.owner_id!==user?.user_id) {
      const sourceAccess=asset.kind==='source' && await one(`SELECT 1 FROM campaigns c JOIN campaign_memberships m ON m.campaign_id=c.id
        WHERE c.source_asset_id=$1 AND m.clipper_id=$2 AND c.state='live'`,[id,user!.user_id]);
      const reviewAccess=asset.kind==='clip' && await one(`SELECT 1 FROM submissions s JOIN campaigns c ON c.id=s.campaign_id
        WHERE s.asset_id=$1 AND c.streamer_id=$2`,[id,user!.user_id]);
      if(!sourceAccess && !reviewAccess) throw new ApiError('FORBIDDEN',403);
    }
    const range=request.headers.get('range')||undefined;
    let result;
    try {result=await getMedia(asset.object_key,range);} catch(e) {if(range) return new Response(null,{status:416});throw e;}
    const headers:Record<string,string>={'content-type':asset.mime,'cache-control':'private, no-store','content-security-policy':"default-src 'none'",'x-content-type-options':'nosniff','accept-ranges':'bytes','content-length':String(result.bytes.length)};
    if(range&&result.contentRange) headers['content-range']=result.contentRange;
    return new Response(result.bytes,{status:range?206:200,headers});
  } catch(e) {return jsonError(e,crypto.randomUUID());}
}
