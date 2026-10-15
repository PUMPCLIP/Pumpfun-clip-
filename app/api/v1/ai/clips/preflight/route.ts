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
    // Availability checks must not reject a job before it reaches the worker.
    // yt-dlp owns the ordered public-client fallback and returns the real
    // extraction error if the hosting IP is challenged by YouTube.
    return Response.json({ok:true,youtube,requiresUpload:false});
  } catch(error) { return jsonError(error,crypto.randomUUID()); }
}
