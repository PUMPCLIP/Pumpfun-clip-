import {mutation,jsonError,ApiError} from '@/lib/auth';
import {tx,audit} from '@/lib/db';
type Context={params:Promise<{provider:string}>};
export async function DELETE(request:Request,context:Context){try{
 const user=await mutation(request),{provider}=await context.params;
 if(!['youtube','tiktok','instagram','x'].includes(provider))throw new ApiError('UNKNOWN_PROVIDER',404);
 await tx(async c=>{
  const row=await c.query('DELETE FROM social_connections WHERE user_id=$1 AND provider=$2 RETURNING id',[user.user_id,provider]);
  await c.query('DELETE FROM social_account_metadata WHERE user_id=$1 AND provider=$2',[user.user_id,provider]);
  await c.query('DELETE FROM social_oauth_states WHERE user_id=$1',[user.user_id]);
  if(row.rows[0])await audit(c,user.user_id,'social.disconnected','social_connection',row.rows[0].id,{provider});
 });
 return Response.json({ok:true,provider,providerAuthorization:'Revoke this app in the provider account settings to remove its existing grant.'});
}catch(e){return jsonError(e,crypto.randomUUID());}}
