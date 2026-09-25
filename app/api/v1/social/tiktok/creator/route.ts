import {requireUser,jsonError,ApiError} from '@/lib/auth';
import {tiktokToken,tiktokDirectEnabled} from '@/lib/tiktok';
export async function GET(){try{
 if(!tiktokDirectEnabled())throw new ApiError('TIKTOK_DIRECT_NOT_ENABLED',503);
 const user=await requireUser(),token=await tiktokToken(user.user_id,'video.publish');
 const r=await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json; charset=UTF-8'},signal:AbortSignal.timeout(15000)});
 const body=await r.json();if(!r.ok||body.error?.code!=='ok'||!Array.isArray(body.data?.privacy_level_options))throw new ApiError('TIKTOK_CREATOR_INFO_UNAVAILABLE',502);
 const d=body.data;return Response.json({username:d.creator_username,nickname:d.creator_nickname,privacyOptions:d.privacy_level_options,commentDisabled:!!d.comment_disabled,duetDisabled:!!d.duet_disabled,stitchDisabled:!!d.stitch_disabled,maxDuration:Number(d.max_video_post_duration_sec)||0});
 }catch(e){return jsonError(e,crypto.randomUUID());}}
