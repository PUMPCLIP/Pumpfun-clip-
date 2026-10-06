'use client';

import {FormEvent, useEffect, useRef, useState} from 'react';
import {creatorPortrait} from '@/lib/creator-images';

type Clip={id:string;clipper_id:string;clipper_name:string;campaign_title:string;target_platforms:string[];video_url:string;view_count:number};
type Person={id:string;display_name:string;roles:string[];accepted_count:number;total_views:number;reputation_score:number;earned_lamports?:number;campaign_count?:number;video_url?:string;campaign_title?:string};

const DEMO_VIDEO='/street-walk-demo.mp4';
const DEMO_POSTER='/street-walk-demo.jpg';
const platforms=[['▶','YouTube'],['♪','TikTok'],['◎','Instagram'],['𝕏','X']] as const;
const mockClips=[
  {label:'THE CONTRARIAN TAKE',score:99},
  {label:'BUILD IN PUBLIC',score:98},
  {label:'THE ROOM WENT SILENT',score:94},
  {label:'LATE NIGHT BUILD LOGS',score:97}
];
const logos=['YouTube','TikTok','Instagram','X'];
const fallbackPeople=[
  {initials:'MC',name:'Maya Chen',role:'Creator · Business',metric:'12 campaigns',label:'published'},
  {initials:'AR',name:'Alex Rivera',role:'Clipper · Hook-first editor',metric:'4.9 rating',label:'portfolio'},
  {initials:'JP',name:'Jordan Park',role:'Clipper · Story + pacing',metric:'31 clips',label:'delivered'},
  {initials:'SK',name:'Sam Kim',role:'Creator · The Signal Room',metric:'8 campaigns',label:'published'},
  {initials:'NT',name:'Noah Tran',role:'Clipper · Culture / commentary',metric:'96% approval',label:'trusted'},
  {initials:'NW',name:'New voices',role:'Join the PumpClip network',metric:'Open roles',label:'available'}
];

function compact(value:number){return new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(Number(value||0));}
function earned(lamports:number){const sol=Number(lamports||0)/1_000_000_000;return sol?`${sol.toFixed(sol<1?.2:1)} SOL earned`:'Rewards starting';}
function supportedVideoUrl(value:string){try{const url=new URL(value,'https://pumpclip.app');return url.protocol==='https:'||url.protocol==='http:';}catch{return false;}}
function platformForHost(hostname:string){const host=hostname.replace(/^www\./,'');if(host==='youtube.com'||host==='youtu.be'||host.endsWith('.youtube.com'))return 'YouTube';if(host==='tiktok.com'||host.endsWith('.tiktok.com'))return 'TikTok';if(host==='instagram.com'||host.endsWith('.instagram.com'))return 'Instagram';if(host==='x.com'||host.endsWith('.x.com')||host==='twitter.com'||host.endsWith('.twitter.com'))return 'X';return '';}

function PreviewMedia({src}:{src:string}){
  const video=useRef<HTMLVideoElement>(null);
  const [failed,setFailed]=useState(false);
  const play=()=>{if(video.current&&!failed)video.current.play().catch(()=>undefined);};
  const pause=()=>{if(video.current){video.current.pause();video.current.currentTime=0;}};
  return <div className={'opus-clip-media '+(failed?'is-fallback':'')} onMouseEnter={play} onMouseLeave={pause} onFocus={play} onBlur={pause}>
    <video ref={video} src={src||DEMO_VIDEO} muted loop playsInline preload="metadata" poster={DEMO_POSTER} onError={()=>setFailed(true)} aria-label="Clip preview video"/>
    <img src={DEMO_POSTER} alt="Street footage preview" aria-hidden="true"/>
  </div>;
}

export default function Landing(){
  const [clips,setClips]=useState<Clip[]>([]);
  const [people,setPeople]=useState<Person[]>([]);
  const [ready,setReady]=useState(false);
  const [url,setUrl]=useState('');
  const [selectedPlatform,setSelectedPlatform]=useState('YouTube');
  const [message,setMessage]=useState('');
  const [mobileMenuOpen,setMobileMenuOpen]=useState(false);
  const [heroFallback,setHeroFallback]=useState(false);
  const [heroPlaying,setHeroPlaying]=useState(true);
  const [heroMuted,setHeroMuted]=useState(true);
  const heroVideo=useRef<HTMLVideoElement>(null);

  useEffect(()=>{
    const load=()=>Promise.allSettled([
      fetch('/api/v1/feed?limit=6',{signal:AbortSignal.timeout(10000)}).then(r=>r.ok?r.json():{items:[]}),
      fetch('/api/v1/profiles?limit=12',{signal:AbortSignal.timeout(10000)}).then(r=>r.ok?r.json():{items:[]})
    ]).then(([feed,network])=>{
      if(feed.status==='fulfilled'&&Array.isArray(feed.value.items))setClips(feed.value.items);
      if(network.status==='fulfilled'&&Array.isArray(network.value.items))setPeople(network.value.items);
      setReady(true);
    });
    const idle=window.setTimeout(load,250);
    return ()=>window.clearTimeout(idle);
  },[]);

  useEffect(()=>{
    if(!mobileMenuOpen)return;
    const closeOnEscape=(event:KeyboardEvent)=>{if(event.key==='Escape')setMobileMenuOpen(false);};
    window.addEventListener('keydown',closeOnEscape);
    return ()=>window.removeEventListener('keydown',closeOnEscape);
  },[mobileMenuOpen]);

  const visiblePeople=people.slice(0,6);
  const heroClip=clips.find(clip=>supportedVideoUrl(clip.video_url));
  const heroSrc=heroFallback||!heroClip?.video_url?DEMO_VIDEO:heroClip.video_url;

  const submitUrl=(event:FormEvent)=>{
    event.preventDefault();
    const value=url.trim();
    if(!value){setMessage('Paste a public video link to get started.');return;}
    try{
      const parsed=new URL(value);
      const sourcePlatform=platformForHost(parsed.hostname);
      if(parsed.protocol!=='https:'||!sourcePlatform){setMessage('Use an HTTPS YouTube, TikTok, Instagram, or X video link.');return;}
      setSelectedPlatform(sourcePlatform);
      setMessage(`Ready to clip from ${sourcePlatform}.`);
      return;
    }catch{setMessage('Enter a valid public video link.');return;}
  };

  async function toggleHeroPlayback(){
    const video=heroVideo.current;if(!video)return;
    if(video.paused){await video.play().catch(()=>undefined);setHeroPlaying(true);}else{video.pause();setHeroPlaying(false);}
  }
  function toggleHeroSound(){const video=heroVideo.current;if(!video)return;video.muted=!video.muted;setHeroMuted(video.muted);}

  return <main className="opus-landing">
    <header className="opus-nav"><a className="opus-logo" href="/" aria-label="pumpclips home"><img src="/pumpclips-mark.jpg" alt="" width={1024} height={1024} /> <span>pumpclips</span></a><button className="opus-menu-toggle" type="button" aria-label={mobileMenuOpen?'Close navigation menu':'Open navigation menu'} aria-expanded={mobileMenuOpen} aria-controls="primary-navigation" onClick={()=>setMobileMenuOpen(open=>!open)}><span/><span/><span/></button><nav id="primary-navigation" className={mobileMenuOpen?'is-open':''} aria-label="Primary navigation"><a href="#showcase" onClick={()=>setMobileMenuOpen(false)}>Showcase</a><a href="/people" onClick={()=>setMobileMenuOpen(false)}>Creators + clippers</a><a href="/feed" onClick={()=>setMobileMenuOpen(false)}>Watch feed</a></nav><div className="opus-nav-actions"><a className="opus-login" href="/auth">Sign in</a><a className="opus-nav-join" href="/auth?mode=signup">Join network <span>↗</span></a></div></header>

    <section className="opus-hero opus-hero-expanded"><div className="opus-hero-copy"><img className="opus-hero-logo" src="/pumpclips-logo.jpg" alt="pumpclips official logo" width={1200} height={1200} fetchPriority="high" /><span className="opus-kicker">THE CLIPPING WORKSPACE / 001</span><h1>Turn long video<br/><em>into momentum.</em></h1><p>Drop in a long-form video. pumpclips helps you find the moments worth sharing, then lets creators and clippers turn them into rewards.</p>
      <form className="opus-url-form" onSubmit={submitUrl}><div className="opus-url-row"><span className="url-link-icon">↗</span><input value={url} onChange={event=>setUrl(event.target.value)} placeholder="Drop a video link (YouTube, TikTok, Instagram, or X)..." aria-label="Long video URL"/><button type="submit">Get clips <span>↗</span></button></div><div className="platform-pills" role="group" aria-label="Supported source platforms">{platforms.map(([icon,name])=><button type="button" className={selectedPlatform===name?'selected':''} key={name} onClick={()=>setSelectedPlatform(name)} aria-pressed={selectedPlatform===name}><b aria-hidden="true">{icon}</b>{name}</button>)}</div></form>{message&&<div className="opus-form-message" role="status"><span>{message}</span><a className="opus-form-action" href="/auth">Sign in to continue <span aria-hidden="true">↗</span></a></div>}<small className="opus-note">Licensed source · Creator review · Transparent rewards</small></div>
      <div className="opus-hero-demo"><div className="demo-browser"><div className="demo-top"><span>● ● ●</span><small>{heroClip&&!heroFallback?'LIVE COMMUNITY CUT':'PUMPCLIPS / DEMO PREVIEW'}</small><b>9:16</b></div><div className="demo-video live-hero-video"><video className={heroClip&&!heroFallback?'hero-media is-clip':'hero-media is-source'} ref={heroVideo} key={heroSrc} src={heroSrc} poster={DEMO_POSTER} muted={heroMuted} autoPlay loop playsInline preload="metadata" onPlay={()=>setHeroPlaying(true)} onPause={()=>setHeroPlaying(false)} onError={()=>setHeroFallback(true)} aria-label="Interactive pumpclips clip preview"/><div className="live-video-shade"/><div className="live-video-copy"><span className="live-video-kicker">{heroClip&&!heroFallback?'FROM THE PUMPCLIPS NETWORK':'LIVE PREVIEW'}</span><strong>{heroClip&&!heroFallback?heroClip.campaign_title:'Make this moment count.'}</strong><small>{heroClip&&!heroFallback?`@${heroClip.clipper_name} · ${compact(heroClip.view_count)} views`:'Upload a source and turn attention into reach.'}</small></div><div className="live-video-controls"><button type="button" onClick={toggleHeroPlayback} aria-label={heroPlaying?'Pause video':'Play video'}>{heroPlaying?'Ⅱ':'▶'}</button><button type="button" onClick={toggleHeroSound} aria-label={heroMuted?'Unmute video':'Mute video'}>{heroMuted?'🔇':'🔊'}</button><span><i/><i/><i/><i/><i/><i/><i/></span></div></div><div className="demo-timeline"><span>00:42</span><i/><i/><i/><i/><i/><i/><span>01:12</span></div></div><div className="demo-sticker">AI<br/><b>→</b> CLIP</div></div></section>

    <section className="opus-proof"><span>USED BY PEOPLE WHO MAKE THE INTERNET MOVE</span><i/><span>9:16 READY</span><i/><span>CREATOR REVIEW</span><i/><span>REWARD THE WORK</span></section>
    <section className="capsule-journey" aria-labelledby="capsule-journey-title"><div className="capsule-heading"><span className="opus-kicker">THE PUMPCLIP LOOP / 002</span><h2 id="capsule-journey-title">One capsule.<br/><em>Everywhere it needs to go.</em></h2><p>From source upload to a paid, published moment, the PumpClip capsule carries the work forward.</p></div><div className="capsule-track" aria-label="Animated five-step capsule journey"><div className="capsule-line"/><span className="journey-capsule" aria-hidden="true"><i/><b/></span>{[['UPLOAD','Capsule enters the logo.','upload'],['PUMP AI','Capsule crosses the timeline.','process'],['FEATURED MOMENT','Capsule splits into a clip.','split'],['PUBLISHED','Capsule shoots outward.','publish'],['EARNINGS','Capsule becomes a glowing token.','reward']].map(([label,copy,key],index)=><article className={'journey-step '+key} key={label}><div className="journey-icon"><span/></div><span className="journey-index">0{index+1}</span><strong>{label}</strong><p>{copy}</p></article>)}</div></section>
    <section className="clipper-proof"><div><span className="opus-kicker">CLIPPER PROFILES / VISIBLE WORK</span><h2>People who turn attention<br/><em>into a living.</em></h2><p>Ranks and badges reward consistency without turning the network into a game.</p><div className="role-actions"><a className="opus-primary" href="/auth?mode=signup&role=clipper">Start clipping <span>↗</span></a><a className="opus-outline" href="/feed">Explore clips <span>↗</span></a></div></div><article className="clipper-card"><div className="clipper-card-head"><img src={creatorPortrait('mina')} alt="Mina creator portrait" width={256} height={256} loading="lazy"/><div><strong>@mina</strong><span>Clipper · Hook-first editor</span></div><b>TOP 04</b></div><div className="clipper-stats"><span><strong>342</strong><small>clips</small></span><span><strong>4.8M</strong><small>reach</small></span><span><strong>18</strong><small>campaigns</small></span><span><strong>2.4 SOL</strong><small>earned</small></span></div><div className="badge-row"><span>Early Clipper</span><span>Top Distributor</span><span>Viral Finder</span></div></article></section>

    <section className="opus-showcase opus-carousel-section" id="showcase"><div className="opus-section-heading"><div><span className="opus-kicker">LIVE CUTS / COMMUNITY SIGNAL</span><h2>Find the hook.<br/><em>Make it travel.</em></h2></div><a href="/feed">Open live feed <span>↗</span></a></div><div className="opus-carousel" aria-label="Generated vertical clip previews">{clips.length?clips.slice(0,6).map((clip,index)=><a className="opus-clip" key={clip.id} href={'/profile/'+clip.clipper_id}><PreviewMedia src={clip.video_url}/><div className="opus-clip-shade"/><span className="viral-score">{[99,98,94,97,96,92][index%6]}</span><div className="opus-clip-copy"><span>{clip.target_platforms?.join(' · ')||'ACCEPTED CUT'}</span><strong>{clip.campaign_title}</strong><small>@{clip.clipper_name} · {compact(clip.view_count)} views</small></div><b>↗</b></a>):ready?mockClips.map(mock=><div className="opus-clip opus-mock-clip" key={mock.label}><PreviewMedia src={DEMO_VIDEO}/><div className="mock-play">▶</div><span className="viral-score">{mock.score}</span><div className="opus-clip-copy"><span>PUMPCLIP PREVIEW</span><strong>{mock.label}</strong><small>Upload a video to generate your cut</small></div></div>):Array.from({length:4}).map((_,index)=><div className="opus-clip opus-skeleton" key={index}><span className="skeleton-circle"/><span className="skeleton-line wide"/><span className="skeleton-line"/></div>)}</div></section>

    <section className="opus-network opus-top-creators"><div className="opus-section-heading"><div><span className="opus-kicker">THE NETWORK / {people.length||'—'} PUBLIC PROFILES</span><h2>Used by top creators,<br/><em>streamers, and clippers.</em></h2></div><a href="/people">View all people <span>↗</span></a></div><div className="opus-people-grid opus-people-grid-rich">{visiblePeople.length?visiblePeople.map(person=><a className="opus-person" key={person.id} href={'/profile/'+person.id}><span className="opus-person-avatar"><img src={creatorPortrait(person.id)} alt="" width={256} height={256} loading="lazy" />{person.display_name.slice(0,2).toUpperCase()}</span><div><strong>{person.display_name}</strong><small>{person.roles.map(role=>role==='streamer'?'Creator':'Clipper').join(' · ')}</small></div><b>{person.roles.includes('clipper')?earned(Number(person.earned_lamports||0)):compact(Number(person.campaign_count||0))+' campaigns'}<small>{person.roles.includes('clipper')?'earned':'published'}</small></b>{person.video_url&&<video src={person.video_url} muted loop playsInline preload="none" poster="/pumpclips-logo.jpg" onError={event=>{event.currentTarget.style.display='none';}}/>}</a>):ready?fallbackPeople.map(person=><div className="opus-person opus-person-placeholder" key={person.name}><span className="opus-person-avatar"><img src={creatorPortrait(person.name)} alt="" width={256} height={256} loading="lazy" />{person.initials}</span><div><strong>{person.name}</strong><small>{person.role}</small></div><b>{person.metric}<small>{person.label}</small></b></div>):Array.from({length:6}).map((_,index)=><div className="opus-person opus-person-skeleton" key={index}><span className="skeleton-avatar"/><div><span className="skeleton-line wide"/><span className="skeleton-line"/></div></div>)}</div><div className="opus-logo-ticker" aria-label="Supported creator platforms">{logos.map(logo=><span key={logo}>{logo}</span>)}</div></section>

    <section className="opus-final"><span className="opus-kicker">START WITH THE MOMENT</span><h2>Bring the source.<br/><em>We’ll help it travel.</em></h2><a className="opus-primary" href="/dashboard">Open your workspace <span>↗</span></a></section><footer className="opus-footer"><a className="opus-logo" href="/" aria-label="pumpclips home"><img src="/pumpclips-mark.jpg" alt="" width={1024} height={1024} /> <span>pumpclips</span></a><span>Creators own the source. Clippers earn the reach.</span><a href="/people">Explore the network ↗</a></footer>
  </main>;
}
