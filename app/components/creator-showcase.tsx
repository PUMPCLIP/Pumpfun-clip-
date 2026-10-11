'use client';

import {useEffect, useState} from 'react';
import {ANSEM, FEATURED_CREATORS, THREADGUY, type FeaturedCreator} from '@/lib/creators';

function embedUrl(youtubeId: string, autoplay = false) {
  return `https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0&modestbranding=1${autoplay ? '&autoplay=1' : ''}`;
}

function SocialBadge({label, handle, url}: {label: 'X' | 'Twitch'; handle: string; url: string}) {
  return <a className={`creator-social creator-social-${label.toLowerCase()}`} href={url} target="_blank" rel="noreferrer" aria-label={`${handle} on ${label}`}>
    <span aria-hidden="true">{label === 'X' ? '𝕏' : '◉'}</span>
    <strong>{label}</strong>
    <small>{handle}</small>
    <b aria-hidden="true">↗</b>
  </a>;
}

function CreatorCard({creator, onWatch}: {creator: FeaturedCreator; onWatch: (creator: FeaturedCreator) => void}) {
  return <article className={`creator-showcase-card creator-showcase-card-${creator.accent}`}>
    <div className="creator-card-top"><span className="creator-avatar">{creator.initials}</span><span className="creator-verified"><i/> FEATURED CREATOR</span></div>
    <div className="creator-card-copy"><h3>{creator.name}</h3><p>{creator.role}</p></div>
    <div className="creator-socials">{creator.socials.map(social => <SocialBadge key={social.label} {...social}/>)}</div>
    {creator.referenceVideo && <button className="creator-watch-link" type="button" onClick={() => onWatch(creator)}><span>▶</span> Watch reference <b>↗</b></button>}
  </article>;
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
      <div className="creator-showcase-heading">
        <div><span className="opus-kicker">FEATURED CREATORS / REAL SIGNAL</span><h2 id={`${variant}-creator-showcase-title`}>Explore a creator<br/><em>below.</em></h2><p>Start with a real conversation, then test how quickly PumpClip can turn a long episode into a sharp vertical cut.</p></div>
        <span className="creator-showcase-index">01 / 02</span>
      </div>
      <div className="creator-showcase-hero">
        <div className="creator-showcase-hero-copy"><span className="creator-live-pill"><i/> REFERENCE EPISODE</span><h3>{interview.title}</h3><p>Threadguy sits down with Ansem for a market conversation built for clips, commentary, and replay.</p><div className="creator-showcase-actions"><button className="creator-primary-action" type="button" onClick={() => setWatching(THREADGUY)}>Watch reference <span>▶</span></button><a className="creator-secondary-action" href={clipUrl}>Try AI clipping <span>↗</span></a></div></div>
        <div className="creator-showcase-hero-frame" aria-label={`${interview.title} video preview`}><iframe src={embedUrl(interview.youtubeId)} title={interview.title} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen/></div>
      </div>
      <div className="creator-showcase-cards">{FEATURED_CREATORS.map(creator => <CreatorCard key={creator.slug} creator={creator} onWatch={setWatching}/>)}</div>
      <div className="creator-showcase-clip-preview"><div className="creator-preview-copy"><span className="opus-kicker">AI-ASSISTED CLIPPING / TEST SOURCE</span><h3>Pick the moment.<br/><em>Keep the signal.</em></h3><p>Use the interview as a live test source. Set a range, add a hook, and send the render to your private workspace.</p><a className="creator-secondary-action" href={clipUrl}>Open in clip engine <span>↗</span></a></div><div className="creator-preview-player"><div className="creator-player-bar"><span><i/> LIVE SOURCE</span><small>{interview.title}</small></div><iframe src={embedUrl(interview.youtubeId)} title={`${interview.title} embedded preview`} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen/></div></div>
    </section>
    {watching?.referenceVideo && <div className="creator-video-modal" role="dialog" aria-modal="true" aria-labelledby="creator-video-modal-title" onMouseDown={event => {if (event.target === event.currentTarget) setWatching(null);}}><div className="creator-video-modal-dialog"><div className="creator-video-modal-head"><div><span className="opus-kicker">REFERENCE WATCH</span><h2 id="creator-video-modal-title">{watching.referenceVideo.title}</h2></div><button type="button" className="creator-video-close" onClick={() => setWatching(null)} aria-label="Close video">×</button></div><div className="creator-video-modal-frame"><iframe src={embedUrl(watching.referenceVideo.youtubeId, true)} title={watching.referenceVideo.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen/></div></div></div>}
  </>;
}

export {ANSEM};
