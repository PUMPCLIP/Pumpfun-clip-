import {ApiError} from './auth';

const base=()=>process.env.OPENCLIP_API_BASE||process.env.OPUSCLIP_API_BASE||'';
const key=()=>process.env.OPENCLIP_API_KEY||process.env.OPUSCLIP_API_KEY||'';
export const openclipConfigured=()=>Boolean(base()&&key());
async function call(path:string,init:RequestInit={}){
  if(!openclipConfigured()) throw new ApiError('OPENCLIP_NOT_CONFIGURED',503,'Configure OPENCLIP_API_BASE and OPENCLIP_API_KEY before using AI clip generation.');
  const response=await fetch(new URL(path.replace(/^\//,''),base()+'/').toString(),{...init,headers:{authorization:`Bearer ${key()}`,'content-type':'application/json',...(init.headers||{})},signal:AbortSignal.timeout(120000)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new ApiError('OPENCLIP_PROVIDER_ERROR',502,`OpenClip provider returned ${response.status}`);
  return data as any;
}
export async function createOpenClip(input:{sourceUrl:string;instructions:string;aspectRatio:'9:16'|'1:1'|'16:9';webhookUrl?:string}){
  // The adapter uses the project-creation contract: POST /projects with a public source URL,
  // prompt/instructions, target aspect ratio, and optional webhook callback.
  return call('/projects',{method:'POST',body:JSON.stringify({source_url:input.sourceUrl,instructions:input.instructions,aspect_ratio:input.aspectRatio,webhook_url:input.webhookUrl})});
}
export async function getOpenClipJob(providerJobId:string){return call('/projects/'+encodeURIComponent(providerJobId));}
