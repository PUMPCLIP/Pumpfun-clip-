import {db,one} from './db';
import {ApiError} from './auth';
export async function rateLimit(userId:string,action:string,limit:number,windowSeconds:number){
 const row=await one<{request_count:number}>(`INSERT INTO user_rate_limits(user_id,action,window_start,request_count) VALUES($1,$2,now(),1)
 ON CONFLICT(user_id,action) DO UPDATE SET
 request_count=CASE WHEN user_rate_limits.window_start<now()-($3::integer * interval '1 second') THEN 1 ELSE user_rate_limits.request_count+1 END,
 window_start=CASE WHEN user_rate_limits.window_start<now()-($3::integer * interval '1 second') THEN now() ELSE user_rate_limits.window_start END
 RETURNING request_count`,[userId,action,windowSeconds],db);
 if(row!.request_count>limit)throw new ApiError('RATE_LIMITED',429);
}
