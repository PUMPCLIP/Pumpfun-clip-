'use client';

import {FormEvent, useEffect, useRef, useState} from 'react';
import GlobalCreatorShowcase from '@/app/components/global-creator-showcase';
import {CREATOR_SPOTLIGHTS} from '@/lib/creator-spotlights';

type Clip={id:string;clipper_id:string;clipper_name:string;campaign_title:string;target_platforms:string[];video_url:string;view_count:number};
type Person={id:string;display_name:string;public_handle?:string;avatar_url?:string|null;roles:string[];accepted_count:number;total_views:number;reputation_score:number;earned_lamports?:number;campaign_count?:number;video_url?:string;campaign_title?:string};

const HERO_CREATOR_SLUGS=['molly-mae-hague','lena-situations','kai-cenat'];
const HERO_CREATORS=CREATOR_SPOTLIGHTS.filter(creator=>HERO_CREATOR_SLUGS.includes(creator.slug));
const platforms=[['▶','YouTube'],['♪','TikTok'],['◎','Instagram'],['𝕏','X']] as const;
const logos=['YouTube','TikTok','Instagram','X'];

function creatorInitials(name:string){return name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase();}
function compact(value:number){return new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(Number(value||0));}
function earned(lamports:number){const sol=Number(lamports||0)/1_000_000_000;return sol?`${sol.toFixed(sol<1?.2:1)} SOL earned`:'Rewards starting';}
function platformForHost(hostname:string){const host=hostname.replace(/^www\./,'');if(host==='youtube.com'||host==='youtu.be'||host.endsWith('.youtube.com'))return 'YouTube';if(host==='tiktok.com'||host.endsWith('.tiktok.com'))return 'TikTok';if(host==='instagram.com'||host.endsWith('.instagram.com'))return 'Instagram';if(host==='x.com'||host.endsWith('.x.com')||host==='twitter.com'||host.endsWith('.twitter.com'))return 'X';return '';}

function PreviewMedia({src}:{src:string}){
  const video=useRef<HTMLVideoElement>(null);
  const [failed,setFailed]=useState(false);
  const play=()=>{if(video.current&&!failed)video.current.play().catch(()=>undefined);};
  const pause=()=>{if(video.current){video.current.pause();video.current.currentTime=0;}}
  return <div className={'opus-clip-media '+(failed?'is-fallback':'')} onMouseEnter={play} onMouseLeave={pause} onFocus={play} onBlur={pause}>
    {failed?<div className="opus-clip-unavailable" role="img" aria-label="Clip preview unavailable">Preview unavailable</div>:<video ref={video} src={src} muted loop playsInline preload="none" onError={()=>setFailed(true)} aria-label="Published creator clip preview"/>}
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
  const [heroCreatorSlug,setHeroCreatorSlug]=useState('molly-mae-hague');

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
  const heroCreator=HERO_CREATORS.find(creator=>creator.slug===heroCreatorSlug)||HERO_CREATORS[0]!;
  // Keep the conversion hero consistent even when live feed clips change.

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


  return <main className="opus-landing">
    <header className="opus-nav"><a className="opus-logo" href="/" aria-label="pumpclips home"><img src="/logo.svg" alt="" width={1024} height={1024} /> <span>pumpclips</span></a><button className="opus-menu-toggle" type="button" aria-label={mobileMenuOpen?'Close navigation menu':'Open navigation menu'} aria-expanded={mobileMenuOpen} aria-controls="primary-navigation" onClick={()=>setMobileMenuOpen(open=>!open)}><span/><span/><span/></button><nav id="primary-navigation" className={mobileMenuOpen?'is-open':''} aria-label="Primary navigation"><a href="#creator-spotlights" onClick={()=>setMobileMenuOpen(false)}>Spotlights</a><a href="/people" onClick={()=>setMobileMenuOpen(false)}>Creators + clippers</a><a href="/feed" onClick={()=>setMobileMenuOpen(false)}>Watch feed</a></nav><div className="opus-nav-actions"><a className="opus-login" href="/auth">Sign in</a><a className="opus-nav-join" href="/auth?mode=signup">Get started <span aria-hidden="true">↗</span></a></div></header>

    <section className="opus-hero opus-hero-expanded">
      <div className="opus-hero-copy">
        <span className="opus-kicker">THE CREATOR CLIP WORKSPACE</span>
        <h1>Find the moment.<br/><em>Make it move.</em></h1>
        <p>Turn long-form video into sharp, captioned clips—and give creators and clippers a clear way to move great moments further.</p>
        <form className="opus-url-form" onSubmit={submitUrl}>
          <div className="opus-url-row"><span className="url-link-icon" aria-hidden="true">↗</span><input value={url} onChange={event=>setUrl(event.target.value)} placeholder="Paste a YouTube, TikTok, Instagram, or X link…" aria-label="Long video URL" inputMode="url" enterKeyHint="go" autoCapitalize="none" autoCorrect="off" aria-describedby="hero-url-help"/><button type="submit">Get clips <span aria-hidden="true">↗</span></button></div>
          <div className="platform-pills" role="group" aria-label="Supported source platforms">{platforms.map(([icon,name])=><button type="button" className={selectedPlatform===name?'selected':''} key={name} onClick={()=>setSelectedPlatform(name)} aria-pressed={selectedPlatform===name}><b aria-hidden="true">{icon}</b>{name}</button>)}</div>
        </form>
        {message&&<div className="opus-form-message" role="status"><span>{message}</span><a className="opus-form-action" href="/auth">Sign in to continue <span aria-hidden="true">↗</span></a></div>}
        <small id="hero-url-help" className="opus-note">No upload required · 9:16-ready output · Creator review · Transparent rewards</small>
        <div className="mobile-conversion-proof" aria-label="A simple three-step workflow"><span><b>01</b><strong>Paste</strong><small>one public link</small></span><span><b>02</b><strong>Pick</strong><small>the moment</small></span><span><b>03</b><strong>Publish</strong><small>in 9:16</small></span></div>
      </div>
      <div className="opus-hero-visual" aria-label={`Featured public clip from ${heroCreator.name}`}>
        <div className="hero-visual-glow" aria-hidden="true"/>
        <div className="hero-visual-card hero-creator-card">
          <div className="hero-visual-toolbar"><span><i/> PUMPCLIP / STORY PREVIEW</span><b>9:16</b></div>
          <div className={'hero-visual-frame hero-creator-frame'+(heroCreator.videoProvider==='youtube'?' has-thumbnail':'')}>
            {heroCreator.videoProvider==='youtube'&&<img className="hero-creator-thumbnail" src={`https://i.ytimg.com/vi/${heroCreator.videoId}/hq720.jpg`} alt="" loading="lazy" decoding="async" onError={event=>{event.currentTarget.style.display='none';event.currentTarget.parentElement?.classList.remove('has-thumbnail');}}/>}
            <span className="hero-creator-monogram" aria-hidden="true">{creatorInitials(heroCreator.name)}</span>
            <div className="hero-visual-vignette" aria-hidden="true"/>
            <span className="hero-moment-tag">{heroCreator.flag} PUBLIC CREATOR <i/> {heroCreator.videoProvider.toUpperCase()}</span>
            <div className="hero-visual-caption"><small>{heroCreator.role}</small><strong>{heroCreator.name}</strong><span className="hero-creator-clip-title">{heroCreator.clipTitle}</span></div>
          </div>
          <div className="hero-visual-footer"><div><small>FEATURED CREATOR</small><strong>{heroCreator.name}</strong></div><div><small>CLIP FORMAT</small><strong>{heroCreator.videoProvider.toUpperCase()} · 9:16</strong></div><a className="hero-visual-play" href={heroCreator.clipUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${heroCreator.name}'s official clip on ${heroCreator.videoProvider}`}>↗</a></div>
          <div className="hero-creator-tabs" role="group" aria-label="Choose a featured creator">
            {HERO_CREATORS.map(creator=><button type="button" key={creator.slug} aria-pressed={heroCreator.slug===creator.slug} onClick={()=>setHeroCreatorSlug(creator.slug)}><span aria-hidden="true">{creatorInitials(creator.name)}</span><span>{creator.name}</span></button>)}
          </div>
        </div>
      </div>
    </section>
    <GlobalCreatorShowcase/>
    <section className="opus-proof"><span>BUILT FOR THE CLIP ECONOMY</span><i/><span>9:16 READY</span><i/><span>CREATOR REVIEW</span><i/><span>REWARD THE WORK</span></section>
    <section className="capsule-journey" aria-labelledby="capsule-journey-title"><div className="capsule-heading"><span className="opus-kicker">THE PUMPCLIP LOOP / 002</span><h2 id="capsule-journey-title">One capsule.<br/><em>Everywhere it needs to go.</em></h2><p>From source upload to a paid, published moment, the PumpClip capsule carries the work forward.</p></div><div className="capsule-track" aria-label="Animated five-step capsule journey"><div className="capsule-line"/><span className="journey-capsule" aria-hidden="true"><i/><b/></span>{[['UPLOAD','Capsule enters the logo.','upload'],['PUMP ENGINE','Capsule crosses the timeline.','process'],['FEATURED MOMENT','Capsule splits into a clip.','split'],['PUBLISHED','Capsule shoots outward.','publish'],['EARNINGS','Capsule becomes a glowing token.','reward']].map(([label,copy,key],index)=><article className={'journey-step '+key} key={label}><div className="journey-icon"><span/></div><span className="journey-index">0{index+1}</span><strong>{label}</strong><p>{copy}</p></article>)}</div></section>

    <section className="opus-showcase opus-carousel-section" id="showcase"><div className="opus-section-heading"><div><span className="opus-kicker">LIVE CUTS / COMMUNITY SIGNAL</span><h2>Real work.<br/><em>Moving in public.</em></h2></div><a href="/feed">Open live feed <span aria-hidden="true">↗</span></a></div><div className="opus-carousel" aria-label="Published creator clip previews">{clips.length?clips.slice(0,6).map(clip=><a className="opus-clip" key={clip.id} href={'/profile/'+clip.clipper_id}><PreviewMedia src={clip.video_url}/><div className="opus-clip-shade"/><div className="opus-clip-copy"><span>{clip.target_platforms?.join(' · ')||'PUBLISHED CUT'}</span><strong>{clip.campaign_title}</strong><small>@{clip.clipper_name} · {compact(clip.view_count)} views</small></div><b aria-hidden="true">↗</b></a>):ready?<div className="opus-feed-empty" role="status">New published clips will appear here as creators share their work.</div>:Array.from({length:4}).map((_,index)=><div className="opus-clip opus-skeleton" key={index}><span className="skeleton-circle"/><span className="skeleton-line wide"/><span className="skeleton-line"/></div>)}</div></section>

    {(!ready||visiblePeople.length>0)&&<section className="opus-network opus-top-creators"><div className="opus-section-heading"><div><span className="opus-kicker">THE PUMPCLIP NETWORK / PUBLIC PROFILES</span><h2>Real creators.<br/><em>Real community signal.</em></h2></div><a href="/people">View all people <span aria-hidden="true">↗</span></a></div><div className="opus-people-grid opus-people-grid-rich">{visiblePeople.length?visiblePeople.map(person=>{const rewards=Number(person.earned_lamports||0);return <a className="opus-person" key={person.id} href={'/profile/'+person.id}><span className="opus-person-avatar">{person.avatar_url?<img src={person.avatar_url} alt="" width={256} height={256} loading="lazy" decoding="async"/>:<span className="opus-person-initials" aria-hidden="true">{person.display_name.slice(0,2).toUpperCase()}</span>}</span><div><strong title={person.display_name}>{person.display_name}</strong><small title={person.roles.join(' · ')}>{person.roles.map(role=>role==='streamer'?'Creator':'Clipper').join(' · ')}</small></div><b>{rewards>0?earned(rewards):compact(Number(person.total_views||0))+' views'}<small>{rewards>0?'earned on PumpClip':'total views'}</small></b>{person.video_url&&<video src={person.video_url} muted loop playsInline preload="none" poster="/logo.svg" onError={event=>{event.currentTarget.style.display='none';}} aria-label={`${person.display_name} published clip preview`}/>}</a>}):Array.from({length:6}).map((_,index)=><div className="opus-person opus-person-skeleton" key={index}><span className="skeleton-avatar"/><div><span className="skeleton-line wide"/><span className="skeleton-line"/></div></div>)}</div><div className="opus-logo-ticker" aria-label="Supported creator platforms">{logos.map(logo=><span key={logo}>{logo}</span>)}</div></section>}

    <section className="opus-final"><span className="opus-kicker">START WITH THE MOMENT</span><h2>Bring the source.<br/><em>We’ll help it travel.</em></h2><a className="opus-primary" href="/auth?mode=signup">Create your account <span aria-hidden="true">↗</span></a></section><footer className="opus-footer"><a className="opus-logo" href="/" aria-label="pumpclips home"><img src="/logo.svg" alt="" width={1024} height={1024} /> <span>pumpclips</span></a><a href="/people">Explore the network ↗</a></footer>
  </main>;
}
