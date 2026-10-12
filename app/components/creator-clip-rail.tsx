'use client';

import {useEffect, useMemo, useRef, useState} from 'react';
import {CREATOR_SPOTLIGHTS, type CreatorSpotlight} from '@/lib/creator-spotlights';

const RAIL_ORDER = ['threadguy', 'ansem', 'ddg', 'ishowspeed', 'jasontheween', 'plaqueboymax'];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

function thumbnailFor(creator: CreatorSpotlight) {
  return creator.thumbnailUrl || (creator.videoProvider === 'youtube' ? `https://i.ytimg.com/vi/${creator.videoId}/hq720.jpg` : '');
}

function embedFor(creator: CreatorSpotlight) {
  const id = encodeURIComponent(creator.videoId);
  if (creator.videoProvider === 'youtube') return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&controls=1&playsinline=1&rel=0`;
  if (creator.videoProvider === 'tiktok') return `https://www.tiktok.com/player/v1/${id}?controls=1&autoplay=0`;
  return `https://www.instagram.com/reel/${id}/embed/`;
}

export default function CreatorClipRail() {
  const [playingSlug, setPlayingSlug] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const creators = useMemo(() => RAIL_ORDER.map(slug => CREATOR_SPOTLIGHTS.find(item => item.slug === slug)).filter((item): item is CreatorSpotlight => Boolean(item)), []);
  const activeCreator = CREATOR_SPOTLIGHTS.find(item => item.slug === playingSlug) ?? null;

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

  return <>
    <section className="opus-showcase opus-carousel-section creator-clip-rail" id="showcase" aria-labelledby="creator-clip-rail-title">
      <div className="opus-section-heading">
        <div><span className="opus-kicker">PUBLIC CREATOR CLIPS / SOURCE PREVIEWS</span><h2 id="creator-clip-rail-title">Real work.<br/><em>Moving in public.</em></h2><p>Public creator moments with clear source thumbnails. Select a clip to load its original player.</p></div>
        <a href="/people">View creator directory</a>
      </div>
      <div className="creator-clip-rail-grid" aria-label="Public creator clip previews">
        {creators.map(creator => <article className="creator-clip-card" key={creator.slug}>
          <button className="creator-clip-card-media" type="button" onClick={() => setPlayingSlug(creator.slug)} aria-label={`Play ${creator.name}: ${creator.clipTitle}`}>
            <span className="creator-clip-card-fallback" aria-hidden="true">{initials(creator.name)}</span>
            {thumbnailFor(creator) && <img src={thumbnailFor(creator)} alt="" loading="lazy" decoding="async" onError={event => {event.currentTarget.style.display = 'none';}}/>}
            <span className="creator-clip-card-play" aria-hidden="true">▶</span>
            <span className="creator-clip-card-format">{creator.videoProvider.toUpperCase()} / PUBLIC CLIP</span>
          </button>
          <div className="creator-clip-card-body">
            <div className="creator-clip-card-identity">
              <span className="creator-clip-card-avatar" aria-hidden="true">
                <span>{initials(creator.name)}</span>
                {thumbnailFor(creator) && <img src={thumbnailFor(creator)} alt="" loading="lazy" decoding="async" onError={event => {event.currentTarget.style.display = 'none';}}/>}
              </span>
              <div><h3 title={creator.name}>{creator.name}</h3><p title={creator.role}>{creator.role}</p></div>
            </div>
            <a href={creator.clipUrl} target="_blank" rel="noopener noreferrer" title={creator.clipTitle}>Watch source</a>
          </div>
        </article>)}
      </div>
    </section>

    {activeCreator && <div className="global-creator-modal-backdrop" role="presentation" onClick={event => {if (event.target === event.currentTarget) setPlayingSlug(null);}}>
      <section className="global-creator-modal creator-clip-modal" role="dialog" aria-modal="true" aria-labelledby="creator-clip-modal-title">
        <header className="global-creator-modal-header"><div><span>{activeCreator.videoProvider.toUpperCase()} / PUBLIC CLIP</span><h3 id="creator-clip-modal-title">{activeCreator.name}</h3></div><button ref={closeButtonRef} className="global-creator-modal-close" type="button" onClick={() => setPlayingSlug(null)} aria-label="Close video player">Close <span aria-hidden="true">×</span></button></header>
        <iframe className="global-creator-modal-player" src={embedFor(activeCreator)} title={`${activeCreator.name}: ${activeCreator.clipTitle}`} loading="eager" allow="autoplay; encrypted-media; picture-in-picture; fullscreen; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen/>
        <a className="global-creator-modal-source" href={activeCreator.clipUrl} target="_blank" rel="noopener noreferrer">Open original clip</a>
      </section>
    </div>}
  </>;
}
