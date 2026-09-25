import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {one} from '@/lib/db';
import {requireUser,ApiError,jsonError} from '@/lib/auth';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const user=await requireUser(),{id}=await params;
    const asset=await one<any>('SELECT * FROM media_assets WHERE id=$1',[id]);
    if(!asset) throw new ApiError('NOT_FOUND',404);
    if(asset.owner_id!==user.user_id) {
      const sourceAccess=asset.kind==='source' && await one(`SELECT 1 FROM campaigns c JOIN campaign_memberships m ON m.campaign_id=c.id
        WHERE c.source_asset_id=$1 AND m.clipper_id=$2 AND c.state='live'`,[id,user.user_id]);
      const reviewAccess=asset.kind==='clip' && await one(`SELECT 1 FROM submissions s JOIN campaigns c ON c.id=s.campaign_id
        WHERE s.asset_id=$1 AND c.streamer_id=$2`,[id,user.user_id]);
      if(!sourceAccess && !reviewAccess) throw new ApiError('FORBIDDEN',403);
    }
    const bytes=await readFile(path.resolve(process.cwd(),'data/private',asset.object_key));
    const headers={'content-type':asset.mime,'cache-control':'private, no-store','content-security-policy':"default-src 'none'",
      'x-content-type-options':'nosniff','accept-ranges':'bytes'};
    const range=request.headers.get('range');
    if(range) {
      const match=/^bytes=(\d+)-(\d*)$/.exec(range);
      if(!match) return new Response(null,{status:416,headers:{...headers,'content-range':`bytes */${bytes.length}`}});
      const start=Number(match[1]),end=match[2]?Math.min(Number(match[2]),bytes.length-1):bytes.length-1;
      if(start>=bytes.length || end<start) return new Response(null,{status:416,headers:{...headers,'content-range':`bytes */${bytes.length}`}});
      const slice=bytes.subarray(start,end+1);
      return new Response(slice,{status:206,headers:{...headers,'content-length':String(slice.length),'content-range':`bytes ${start}-${end}/${bytes.length}`}});
    }
    return new Response(bytes,{headers:{...headers,'content-length':String(bytes.length)}});
  } catch(e) {return jsonError(e,crypto.randomUUID());}
}
