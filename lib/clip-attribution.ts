export type ClipPlatform='tiktok'|'x'|'youtube_shorts';
export type ClipFeeShares={total:bigint;clipper:bigint;streamer:bigint;platform:bigint};

export function parseClipUrl(value:string):{url:string;platform:ClipPlatform}{
  let parsed:URL;
  try{parsed=new URL(value.trim());}catch{throw new Error('Enter a valid TikTok, X, or YouTube Shorts URL.');}
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port)throw new Error('Clip links must use a public HTTPS URL.');
  const host=parsed.hostname.toLowerCase().replace(/^www\./,'');
  let platform:ClipPlatform;
  if(host==='tiktok.com'||host.endsWith('.tiktok.com')){
    if(!/\/video\/\d+/i.test(parsed.pathname)&&!/^\/[A-Za-z0-9_-]{3,}$/i.test(parsed.pathname))throw new Error('Use a TikTok video link.');
    platform='tiktok';
  }else if(host==='x.com'||host==='twitter.com'){
    if(!/^\/[A-Za-z0-9_]{1,20}\/status\/\d+/i.test(parsed.pathname))throw new Error('Use an X or Twitter post link.');
    platform='x';
  }else if(host==='youtube.com'||host==='m.youtube.com'){
    if(!/^\/shorts\/[A-Za-z0-9_-]{6,}/i.test(parsed.pathname))throw new Error('Use a YouTube Shorts URL in the /shorts/ format.');
    platform='youtube_shorts';
  }else throw new Error('Only TikTok, X, and YouTube Shorts links are supported.');
  parsed.hostname=host;
  parsed.search='';parsed.hash='';
  return {url:parsed.toString(),platform};
}

export function calculateClipFee(amountRaw:string|bigint):ClipFeeShares{
  const amount=typeof amountRaw==='bigint'?amountRaw:BigInt(amountRaw);
  if(amount<=0n)throw new Error('Trade amount must be positive.');
  const total=amount*100n/10_000n;
  const clipper=amount*40n/10_000n;
  const streamer=amount*40n/10_000n;
  const platform=total-clipper-streamer;
  if(total<=0n||clipper<=0n||streamer<=0n||platform<=0n)throw new Error('Trade amount is too small to split the clip attribution fee safely.');
  return {total,clipper,streamer,platform};
}
