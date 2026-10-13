import {jsonError} from '@/lib/auth';

export const runtime='nodejs';

function isYoutube(value:string){
  try {
    const host=new URL(value).hostname.toLowerCase().replace(/^www\./,'');
    return host==='youtube.com'||host.endsWith('.youtube.com')||host==='youtu.be';
  } catch { return false; }
}

export async function GET(request:Request){
  try {
    const value=new URL(request.url).searchParams.get('url')||'';
    const youtube=isYoutube(value);
    return Response.json({ok:!youtube||Boolean(process.env.YOUTUBE_COOKIES_B64||process.env.YOUTUBE_COOKIES_FILE),youtube,requiresUpload:youtube&&!process.env.YOUTUBE_COOKIES_B64&&!process.env.YOUTUBE_COOKIES_FILE});
  } catch(error) { return jsonError(error,crypto.randomUUID()); }
}
