import {z} from 'zod';
import {one,db,audit} from '@/lib/db';
import {mutation,requireUser,ApiError,jsonError} from '@/lib/auth';
import {gate} from '@/lib/access';
export const runtime='nodejs';
export async function POST(request:Request) {
  try {
    const user=await mutation(request); await gate(user.user_id,'clipper');
    const key=request.headers.get('idempotency-key');
    if(!key || key.length>128) throw new ApiError('IDEMPOTENCY_KEY_REQUIRED');
    const parsed=z.object({campaignId:z.string().uuid(),start:z.number().min(0),end:z.number().positive(),caption:z.string().max(200).default('')}).safeParse(await request.json().catch(()=>null));
    if(!parsed.success) throw new ApiError('INVALID_INPUT',400);
    const data=parsed.data;
    if(data.end<=data.start || data.end-data.start>180) throw new ApiError('INVALID_SEGMENT',422);
    const campaign=await one<any>(`SELECT c.source_asset_id FROM campaigns c JOIN campaign_memberships m ON m.campaign_id=c.id
      WHERE c.id=$1 AND c.state='live' AND m.clipper_id=$2`,[data.campaignId,user.user_id]);
    if(!campaign?.source_asset_id) throw new ApiError('SOURCE_ACCESS_REQUIRED',403);
    const existing=await one<any>('SELECT * FROM studio_jobs WHERE owner_id=$1 AND idempotency_key=$2',[user.user_id,key]);
    if(existing) return Response.json(existing);
    const project=await one<any>(`INSERT INTO studio_projects(owner_id,campaign_id,source_asset_id) VALUES($1,$2,$3) RETURNING *`,
      [user.user_id,data.campaignId,campaign.source_asset_id]);
    const job=await one<any>(`INSERT INTO studio_jobs(project_id,owner_id,start_seconds,end_seconds,caption,idempotency_key) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [project.id,user.user_id,data.start,data.end,data.caption,key]);
    await audit(db,user.user_id,'studio.job_queued','studio_job',job.id);
    return Response.json(job,{status:201});
  } catch(e) {return jsonError(e,crypto.randomUUID());}
}
