'use client';

import {useEffect, useState} from 'react';
import {ANSEM, FEATURED_CREATORS, THREADGUY, type FeaturedCreator} from '@/lib/creators';
import {CREATOR_SPOTLIGHTS} from '@/lib/creator-spotlights';
import {DEMO_CLIPS} from '@/lib/demo-clips';

function embedUrl(youtubeId: string, autoplay = false) {
  return `https://www.youtube-nocookie.com/embed/${youtubeId}?controls=1&modestbranding=1&rel=0&playsinline=1&enablejsapi=1&mute=1${autoplay ? '&autoplay=1' : ''}`;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

function creatorThumbnail(slug: string) {
  const creator = CREATOR_SPOTLIGHTS.find(item => item.slug === slug);
  return creator?.thumbnailUrl || (creator?.videoProvider === 'youtube' ? `https://i.ytimg.com/vi/${creator.videoId}/hq720.jpg` : '');
}

function SocialBadge({label, handle, url}: {label: 'X' | 'Twitch'; handle: string; url: string}) {
  return <a className={`creator-social creator-social-${label.toLowerCase()}`} href={url} target="_blank" rel="noreferrer" aria-label={`${handle} on ${label}`}>
    <span aria-hidden="true">{label === 'X' ? '𝕏' : '◉'}</span><strong>{label}</strong><small>{handle}</small>
  </a>;
}

function CreatorCard({creator, onWatch}: {creator: FeaturedCreator; onWatch: (creator: FeaturedCreator) => void}) {
  const thumbnail = creatorThumbnail(creator.slug);
  return <article className={`creator-showcase-card creator-showcase-card-${creator.accent}`}>
    <div className="creator-card-top"><span className="creator-avatar"><span>{creator.initials}</span>{thumbnail && <img src={thumbnail} alt="" loading="lazy" decoding="async" onError={event => {event.currentTarget.style.display = 'none';}}/>}</span><span className="creator-verified"><i/> FEATURED CREATOR</span></div>
    <div className="creator-card-copy"><h3>{creator.name}</h3><p>{creator.role}</p></div>
    <div className="creator-socials">{creator.socials.map(social => <SocialBadge key={social.label} {...social}/>)}</div>
    {creator.referenceVideo && <button className="creator-watch-link" type="button" onClick={() => onWatch(creator)}><span aria-hidden="true">▶</span> Watch reference</button>}
  </article>;
}

function ClipThumbnail({name, slug, videoId, onClick, label}: {name: string; slug: string; videoId?: string; onClick: () => void; label: string}) {
  const thumbnail = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : creatorThumbnail(slug);
  return <button className="creator-showcase-preview-button" type="button" onClick={onClick} aria-label={`Play ${name} public clip`}>
    <span className="creator-showcase-preview-fallback" aria-hidden="true">{initials(name)}</span>
    {thumbnail && <img src={thumbnail} alt="" loading="lazy" decoding="async" onError={event => {event.currentTarget.style.display = 'none';}}/>}
    <span className="creator-showcase-preview-play" aria-hidden="true">▶</span><span className="creator-showcase-preview-label">{label}</span>
  </button>;
}

export default function CreatorShowcase({variant = 'landing'}: {variant?: 'landing' | 'studio'}) {
  const [watching, setWatching] = useState<FeaturedCreator | null>(null);

  useEffect(() => {
    if (!watching) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setWatching(null); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', onKeyDown); };
  }, [watching]);

  const interview = THREADGUY.referenceVideo!;
  const clipUrl = `/dashboard?view=clip-engine&sourceUrl=${encodeURIComponent(interview.url)}`;

  return <>
    <section className={`creator-showcase creator-showcase-${variant}`} aria-labelledby={`${variant}-creator-showcase-title`}>
      <div className="creator-showcase-heading"><div><span className="opus-kicker">FEATURED CREATORS / REAL SIGNAL</span><h2 id={`${variant}-creator-showcase-title`}>Explore a creator<br/><em>below.</em></h2><p>Start with a real conversation, then test how quickly PumpClip can turn a long episode into a sharp vertical cut.</p></div><span className="creator-showcase-index">01 / 02</span></div>
      <div className="creator-showcase-hero">
        <div className="creator-showcase-hero-copy"><span className="creator-live-pill"><i/> REFERENCE EPISODE</span><h3>{interview.title}</h3><p>Threadguy sits down with Ansem for a market conversation built for clips, commentary, and replay.</p><div className="creator-showcase-actions"><button className="creator-primary-action" type="button" onClick={() => setWatching(THREADGUY)}>Watch reference <span aria-hidden="true">▶</span></button><a className="creator-secondary-action" href={clipUrl}>Try AI clipping</a></div></div>
        <div className="creator-showcase-hero-frame" id="creator-source-player" aria-label={`${interview.title} video preview`}><ClipThumbnail name="Threadguy and Ansem" slug="threadguy" videoId={interview.youtubeId} onClick={() => setWatching(THREADGUY)} label="PLAY THE REFERENCE"/></div>
      </div>
      <div className="creator-showcase-cards">{FEATURED_CREATORS.map(creator => <CreatorCard key={creator.slug} creator={creator} onWatch={setWatching}/>)}</div>
      <div className="creator-streamer-roster"><div className="creator-roster-heading"><div><span className="opus-kicker">CREATOR ROSTER / PUBLIC CLIPS</span><h3>More voices.<br/><em>More moments.</em></h3></div><a className="creator-secondary-action" href="#creator-source-player">Open a source player</a></div><div className="creator-streamer-grid">{DEMO_CLIPS.map(clip => <a className={`creator-streamer-chip creator-streamer-chip-${clip.accent}`} href={clip.socialUrl} target="_blank" rel="noopener noreferrer" key={clip.slug}><span className="creator-streamer-avatar"><span>{clip.initials}</span>{clip.thumbnailUrl && <img src={clip.thumbnailUrl} alt="" loading="lazy" decoding="async" onError={event => {event.currentTarget.style.display = 'none';}}/>}</span><span><strong>{clip.name}</strong><small>{clip.role}</small></span><b>{clip.duration}</b></a>)}</div></div>
      <div className="creator-showcase-clip-preview"><div className="creator-preview-copy"><span className="opus-kicker">AI-ASSISTED CLIPPING / TEST SOURCE</span><h3>Pick the moment.<br/><em>Keep the signal.</em></h3><p>Use the interview as a live test source. Set a range, add a hook, and send the render to your private workspace.</p><a className="creator-secondary-action" href={clipUrl}>Open in clip engine</a></div><div className="creator-preview-player"><div className="creator-player-bar"><span><i/> PUBLIC SOURCE</span><small>{interview.title}</small></div><ClipThumbnail name="Threadguy and Ansem" slug="threadguy" videoId={interview.youtubeId} onClick={() => setWatching(THREADGUY)} label="PLAY PUBLIC SOURCE"/></div></div>
    </section>
    {watching?.referenceVideo && <div className="creator-video-modal" role="dialog" aria-modal="true" aria-labelledby="creator-video-modal-title" onMouseDown={event => {if (event.target === event.currentTarget) setWatching(null);}}><div className="creator-video-modal-dialog"><div className="creator-video-modal-head"><div><span className="opus-kicker">REFERENCE WATCH</span><h2 id="creator-video-modal-title">{watching.referenceVideo.title}</h2></div><button type="button" className="creator-video-close" onClick={() => setWatching(null)} aria-label="Close video">×</button></div><div className="creator-video-modal-frame"><iframe src={embedUrl(watching.referenceVideo.youtubeId, true)} title={watching.referenceVideo.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen/></div></div></div>}
  </>;
}

export {ANSEM};
