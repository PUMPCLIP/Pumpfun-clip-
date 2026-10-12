'use client';

import {useEffect, useMemo, useRef, useState} from 'react';
import {DEMO_CATEGORIES, DEMO_CLIPS} from '@/lib/demo-clips';

function thumbnailFor(clip: (typeof DEMO_CLIPS)[number]) {
  if (clip.thumbnailUrl) return clip.thumbnailUrl;
  const id = clip.videoId || clip.embedUrl.match(/\/embed\/([^?]+)/)?.[1];
  return id ? `https://i.ytimg.com/vi/${id}/hq720.jpg` : '';
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

export default function DemoPreview({compact = false}: {compact?: boolean}) {
  const [category, setCategory] = useState<(typeof DEMO_CATEGORIES)[number]['key']>('all');
  const [activeSlug, setActiveSlug] = useState('pokimane');
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const filtered = useMemo(() => {
    if (category === 'all') return DEMO_CLIPS;
    return DEMO_CLIPS.filter(clip => clip.category === category);
  }, [category]);
  const active = filtered.find(clip => clip.slug === activeSlug) || filtered[0] || DEMO_CLIPS[0];

  useEffect(() => {
    setActiveSlug(current => filtered.some(clip => clip.slug === current) ? current : filtered[0]?.slug || 'pokimane');
    setIsPlaying(false);
    setAudioEnabled(false);
  }, [category, filtered]);

  useEffect(() => {
    setIsPlaying(false);
    setAudioEnabled(false);
  }, [active.slug]);

  function playerCommand(func: string) {
    frameRef.current?.contentWindow?.postMessage(JSON.stringify({event: 'command', func}), '*');
  }

  function toggleAudio() {
    if (audioEnabled) { playerCommand('mute'); setAudioEnabled(false); return; }
    playerCommand('unMute');
    playerCommand('playVideo');
    setAudioEnabled(true);
  }

  const thumbnail = thumbnailFor(active);
  const sourceTitle = active.clipTitle || active.name;

  return <section className={`demo-preview ${compact ? 'demo-preview-compact' : ''}`} id={compact ? '' : 'demo-preview'} aria-labelledby={`${compact ? 'compact-' : ''}demo-preview-title`}>
    <div className="demo-preview-heading"><div><span className="opus-kicker">PUMPCLIPS / DEMO PREVIEW</span><h2 id={`${compact ? 'compact-' : ''}demo-preview-title`}>One player.<br/><em>Every kind of signal.</em></h2><p>Choose a public creator source and open its original player when you are ready.</p></div><span className="demo-preview-ratio">9:16 / SOURCE PREVIEW</span></div>
    <div className="demo-preview-filters" role="tablist" aria-label="Filter demo creators">{DEMO_CATEGORIES.map(item => <button type="button" role="tab" aria-selected={category === item.key} className={category === item.key ? 'is-active' : ''} key={item.key} onClick={() => {setCategory(item.key); setIsPlaying(false); setAudioEnabled(false);}}>{item.label}</button>)}</div>
    <div className="demo-preview-layout">
      <div className="demo-preview-player-shell">
        <div className="demo-preview-topbar"><span><i/> SOURCE PLAYER</span><small>{active.duration} · {active.aspectRatio}</small></div>
        <div className={`demo-preview-frame demo-preview-accent-${active.accent}`}>
          {isPlaying ? <>
            <iframe ref={frameRef} key={active.slug} src={active.embedUrl} title={`${active.name} public clip`} loading="eager" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen/>
            <button type="button" className={`demo-preview-audio ${audioEnabled ? 'is-on' : ''}`} onClick={toggleAudio} aria-label={audioEnabled ? 'Mute clip audio' : 'Enable clip audio'}>{audioEnabled ? 'Mute audio' : 'Enable audio'}</button>
          </> : <button className="demo-preview-cover" type="button" onClick={() => setIsPlaying(true)} aria-label={`Play ${active.name}: ${sourceTitle}`}>
            <span className="demo-preview-cover-fallback" aria-hidden="true">{initials(active.name)}</span>
            {thumbnail && <img src={thumbnail} alt="" loading="lazy" decoding="async" onError={event => {event.currentTarget.style.display = 'none';}}/>}
            <span className="demo-preview-cover-play" aria-hidden="true">▶</span>
            <span className="demo-preview-caption"><span className="demo-caption-label">PUBLIC SOURCE</span><strong>{sourceTitle}</strong></span>
          </button>}
          <span className="demo-preview-watermark">PUMPCLIP</span>
        </div>
        <a className="demo-preview-source-link" href={active.socialUrl} target="_blank" rel="noopener noreferrer">Open {active.name} public channel</a>
      </div>
      <div className="demo-preview-roster" role="list" aria-label="Featured public creator clips">{filtered.map(clip => <button type="button" role="listitem" className={`demo-streamer-tab ${active.slug === clip.slug ? 'is-active' : ''}`} key={clip.slug} onClick={() => {setActiveSlug(clip.slug); setIsPlaying(false); setAudioEnabled(false);}}>
        <span className={`demo-streamer-avatar demo-avatar-${clip.accent}`}><span>{clip.initials}</span>{thumbnailFor(clip) && <img src={thumbnailFor(clip)} alt="" loading="lazy" decoding="async" onError={event => {event.currentTarget.style.display = 'none';}}/>}</span>
        <span><strong>{clip.name}</strong><small>{clip.role}</small></span><b>{clip.duration}</b>
      </button>)}</div>
    </div>
  </section>;
}

export {DEMO_CLIPS};
