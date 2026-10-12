'use client';

import {useEffect, useMemo, useRef, useState} from 'react';
import {CREATOR_SPOTLIGHTS, type CreatorSpotlight, type CreatorSpotlightCategory} from '@/lib/creator-spotlights';

const filters: Array<{key: 'all' | CreatorSpotlightCategory; label: string}> = [
  {key: 'all', label: 'All creators'},
  {key: 'fashion', label: 'Fashion'},
  {key: 'beauty', label: 'Beauty'},
  {key: 'lifestyle', label: 'Lifestyle'},
  {key: 'streaming', label: 'Live & gaming'},
  {key: 'finance', label: 'Finance'},
];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

function thumbnailFor(creator: CreatorSpotlight) {
  return creator.thumbnailUrl || (creator.videoProvider === 'youtube' ? `https://i.ytimg.com/vi/${creator.videoId}/hq720.jpg` : '');
}

function videoEmbedUrl(creator: CreatorSpotlight) {
  const id = encodeURIComponent(creator.videoId);
  if (creator.videoProvider === 'youtube') return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&controls=1&playsinline=1&rel=0`;
  if (creator.videoProvider === 'tiktok') return `https://www.tiktok.com/player/v1/${id}?controls=1&autoplay=0`;
  return `https://www.instagram.com/reel/${id}/embed/`;
}

export default function GlobalCreatorShowcase() {
  const [category, setCategory] = useState<'all' | CreatorSpotlightCategory>('all');
  const [playingSlug, setPlayingSlug] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const creators = useMemo(() => category === 'all' ? CREATOR_SPOTLIGHTS : CREATOR_SPOTLIGHTS.filter(creator => creator.category === category), [category]);
  const activeCreator = CREATOR_SPOTLIGHTS.find(creator => creator.slug === playingSlug) ?? null;

  useEffect(() => {
    if (!activeCreator) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setPlayingSlug(null); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
      window.cancelAnimationFrame(focusFrame);
      previousFocus?.focus();
    };
  }, [activeCreator]);

  return <section className="global-creator-showcase" id="creator-spotlights" aria-labelledby="global-creator-title">
    <header className="global-creator-heading">
      <div><span className="opus-kicker">GLOBAL CREATOR SPOTLIGHT / PUBLIC PROFILES</span><h2 id="global-creator-title">From street style<br/><em>to live-stream energy.</em></h2><p>Explore public creator channels across fashion, beauty, culture, finance, and gaming. Open a source clip or visit the creator’s own profile.</p></div>
      <span className="global-creator-count">{CREATOR_SPOTLIGHTS.length.toString().padStart(2, '0')} / SPOTLIGHTS</span>
    </header>

    <div className="global-creator-filter" role="group" aria-label="Filter creator spotlights">
      {filters.map(filter => <button type="button" key={filter.key} className={category === filter.key ? 'is-active' : ''} aria-pressed={category === filter.key} onClick={() => {setCategory(filter.key); setPlayingSlug(null);}}>{filter.label}</button>)}
    </div>

    <div className="global-creator-grid">
      {creators.map(creator => {
        const thumbnail = thumbnailFor(creator);
        return <article className="global-creator-card" key={creator.slug}>
          <div className="global-creator-media">
            <div className={`global-creator-media-fallback${thumbnail ? ' has-thumbnail' : ''}`} aria-hidden="true">
              {thumbnail && <img className="global-creator-video-thumbnail" src={thumbnail} alt="" loading="lazy" decoding="async" onError={event => {event.currentTarget.style.display = 'none'; event.currentTarget.parentElement?.classList.remove('has-thumbnail');}}/>}
              <span className="global-creator-media-monogram">{initials(creator.name)}</span>
              <span className="global-creator-media-caption">{creator.name}</span>
              <span className="global-creator-media-platform">{creator.videoProvider.toUpperCase()} · PUBLIC CLIP</span>
            </div>
            <button className="global-creator-play" type="button" onClick={() => setPlayingSlug(creator.slug)} aria-label={`Open public clip from ${creator.name}`}><span aria-hidden="true">▶</span><small>OPEN PUBLIC CLIP</small></button>
            <span className="global-creator-ratio">9:16 / OFFICIAL PLAYER</span>
          </div>
          <div className="global-creator-card-body">
            <div className="global-creator-profile-row">
              <span className="global-creator-avatar global-creator-avatar-fallback" aria-hidden="true">
                <span className="global-creator-avatar-initials">{initials(creator.name)}</span>
                {thumbnail && <img src={thumbnail} alt="" loading="lazy" decoding="async" onError={event => {event.currentTarget.style.display = 'none';}}/>}
              </span>
              <div className="global-creator-name-wrap"><h3 title={creator.name}>{creator.name}</h3><p title={creator.role}>{creator.role}</p></div>
              <a className="global-creator-profile-link" href={creator.profileUrl} target="_blank" rel="noopener noreferrer">Profile</a>
            </div>
            <div className="global-creator-meta"><span title={creator.region}>{creator.flag} {creator.region}</span><b>PUBLIC PROFILE</b></div>
            <a className="global-creator-source-link" href={creator.clipUrl} target="_blank" rel="noopener noreferrer" title={creator.clipTitle}>{creator.clipTitle}</a>
          </div>
        </article>;
      })}
    </div>

    <p className="global-creator-disclaimer">Independent editorial spotlights linking to public channels. Not affiliated with or endorsed by the featured creators. Source thumbnails are public video stills; playable embeds load only when selected.</p>

    {activeCreator && <div className="global-creator-modal-backdrop" role="presentation" onClick={event => {if (event.target === event.currentTarget) setPlayingSlug(null);}}>
      <section className="global-creator-modal" role="dialog" aria-modal="true" aria-labelledby="global-creator-modal-title">
        <header className="global-creator-modal-header"><div><span>{activeCreator.videoProvider.toUpperCase()} / PUBLIC CLIP</span><h3 id="global-creator-modal-title">{activeCreator.name}</h3></div><button ref={closeButtonRef} className="global-creator-modal-close" type="button" onClick={() => setPlayingSlug(null)} aria-label="Close video player">Close <span aria-hidden="true">×</span></button></header>
        <iframe className="global-creator-modal-player" src={videoEmbedUrl(activeCreator)} title={`${activeCreator.name}: ${activeCreator.clipTitle}`} loading="eager" allow="autoplay; encrypted-media; picture-in-picture; fullscreen; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen/>
        <a className="global-creator-modal-source" href={activeCreator.clipUrl} target="_blank" rel="noopener noreferrer">Open original clip on {activeCreator.videoProvider}</a>
      </section>
    </div>}
  </section>;
}
