'use client';

import {FormEvent, useEffect, useState} from 'react';
import CreatorClipRail from '@/app/components/creator-clip-rail';
import GlobalCreatorShowcase from '@/app/components/global-creator-showcase';
import {CREATOR_SPOTLIGHTS} from '@/lib/creator-spotlights';

type Person = {
  id: string;
  display_name: string;
  public_handle?: string;
  avatar_url?: string | null;
  roles: string[];
  accepted_count: number;
  total_views: number;
  reputation_score: number;
  earned_lamports?: number;
  campaign_count?: number;
};

const HERO_CREATOR_SLUGS = ['molly-mae-hague', 'lena-situations', 'kai-cenat'];
const HERO_CREATORS = HERO_CREATOR_SLUGS.map(slug => CREATOR_SPOTLIGHTS.find(creator => creator.slug === slug)).filter((creator): creator is (typeof CREATOR_SPOTLIGHTS)[number] => Boolean(creator));
const platforms = [['▶', 'YouTube'], ['♪', 'TikTok'], ['◎', 'Instagram'], ['𝕏', 'X']] as const;
const logos = ['YouTube', 'TikTok', 'Instagram', 'X'];

function creatorInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

function compact(value: number) {
  return new Intl.NumberFormat('en', {notation: 'compact', maximumFractionDigits: 1}).format(Number(value || 0));
}

function earnedSol(lamports: number) {
  const sol = Number(lamports || 0) / 1_000_000_000;
  return `${new Intl.NumberFormat('en', {maximumFractionDigits: sol < 1 ? 3 : 2}).format(sol)} SOL`;
}

function platformForHost(hostname: string) {
  const host = hostname.replace(/^www\./, '');
  if (host === 'youtube.com' || host === 'youtu.be' || host.endsWith('.youtube.com')) return 'YouTube';
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'TikTok';
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'Instagram';
  if (host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com')) return 'X';
  return '';
}

export default function Landing() {
  const [people, setPeople] = useState<Person[]>([]);
  const [ready, setReady] = useState(false);
  const [url, setUrl] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState('YouTube');
  const [message, setMessage] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [heroCreatorSlug, setHeroCreatorSlug] = useState('molly-mae-hague');

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch('/api/v1/profiles?limit=12', {signal: controller.signal, cache: 'no-store'})
        .then(response => response.ok ? response.json() : {items: []})
        .then(data => { if (Array.isArray(data.items)) setPeople(data.items); })
        .catch(() => undefined)
        .finally(() => setReady(true));
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileMenuOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileMenuOpen]);

  const visiblePeople = people.slice(0, 6);
  const heroCreator = HERO_CREATORS.find(creator => creator.slug === heroCreatorSlug) || HERO_CREATORS[0]!;

  const submitUrl = (event: FormEvent) => {
    event.preventDefault();
    const value = url.trim();
    if (!value) { setMessage('Paste a public video link to get started.'); return; }
    try {
      const parsed = new URL(value);
      const sourcePlatform = platformForHost(parsed.hostname);
      if (parsed.protocol !== 'https:' || !sourcePlatform) { setMessage('Use an HTTPS YouTube, TikTok, Instagram, or X video link.'); return; }
      setSelectedPlatform(sourcePlatform);
      setMessage(`Ready to clip from ${sourcePlatform}.`);
    } catch {
      setMessage('Enter a valid public video link.');
    }
  };

  const heroThumbnail = heroCreator.thumbnailUrl || (heroCreator.videoProvider === 'youtube' ? `https://i.ytimg.com/vi/${heroCreator.videoId}/hq720.jpg` : '');

  return <main className="opus-landing">
    <header className="opus-nav">
      <a className="opus-logo" href="/" aria-label="pumpclips home"><img src="/logo.svg" alt="" width={1024} height={1024}/><span>pumpclips</span></a>
      <button className="opus-menu-toggle" type="button" aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={mobileMenuOpen} aria-controls="primary-navigation" onClick={() => setMobileMenuOpen(open => !open)}><span/><span/><span/></button>
      <nav id="primary-navigation" className={mobileMenuOpen ? 'is-open' : ''} aria-label="Primary navigation"><a href="#creator-spotlights" onClick={() => setMobileMenuOpen(false)}>Spotlights</a><a href="/people" onClick={() => setMobileMenuOpen(false)}>Creators + clippers</a><a href="/feed" onClick={() => setMobileMenuOpen(false)}>Watch feed</a></nav>
      <div className="opus-nav-actions"><a className="opus-login" href="/auth">Sign in</a><a className="opus-nav-join" href="/auth?mode=signup">Get started</a></div>
    </header>

    <section className="opus-hero opus-hero-expanded">
      <div className="opus-hero-copy">
        <span className="opus-kicker">THE CREATOR CLIP WORKSPACE</span>
        <h1>Find the moment.<br/><em>Make it move.</em></h1>
        <p>Turn long-form video into sharp, captioned clips—and give creators and clippers a clear way to move great moments further.</p>
        <form className="opus-url-form" onSubmit={submitUrl}>
          <div className="opus-url-row"><input value={url} onChange={event => setUrl(event.target.value)} placeholder="Paste a YouTube, TikTok, Instagram, or X link…" aria-label="Long video URL" inputMode="url" enterKeyHint="go" autoCapitalize="none" autoCorrect="off" aria-describedby="hero-url-help"/><button type="submit">Get clips</button></div>
          <div className="platform-pills" role="group" aria-label="Supported source platforms">{platforms.map(([icon, name]) => <button type="button" className={selectedPlatform === name ? 'selected' : ''} key={name} onClick={() => setSelectedPlatform(name)} aria-pressed={selectedPlatform === name}><b aria-hidden="true">{icon}</b>{name}</button>)}</div>
        </form>
        {message && <div className="opus-form-message" role="status"><span>{message}</span><a className="opus-form-action" href="/auth">Sign in to continue</a></div>}
        <small id="hero-url-help" className="opus-note">No upload required · 9:16-ready output · Creator review · Transparent rewards</small>
        <div className="mobile-conversion-proof" aria-label="A simple three-step workflow"><span><b>01</b><strong>Paste</strong><small>one public link</small></span><span><b>02</b><strong>Pick</strong><small>the moment</small></span><span><b>03</b><strong>Publish</strong><small>in 9:16</small></span></div>
      </div>
      <div className="opus-hero-visual" aria-label={`Featured public clip from ${heroCreator.name}`}>
        <div className="hero-visual-glow" aria-hidden="true"/>
        <div className="hero-visual-card hero-creator-card">
          <div className="hero-visual-toolbar"><span><i/> PUMPCLIP / STORY PREVIEW</span><b>9:16</b></div>
          <div className={'hero-visual-frame hero-creator-frame' + (heroThumbnail ? ' has-thumbnail' : '')}>
            <span className="hero-creator-monogram" aria-hidden="true">{creatorInitials(heroCreator.name)}</span>
            {heroThumbnail && <img className="hero-creator-thumbnail" src={heroThumbnail} alt="" loading="lazy" decoding="async" onError={event => {event.currentTarget.style.display = 'none'; event.currentTarget.parentElement?.classList.remove('has-thumbnail');}}/>}
            <div className="hero-visual-vignette" aria-hidden="true"/>
            <span className="hero-moment-tag">{heroCreator.flag} PUBLIC CREATOR <i/> {heroCreator.videoProvider.toUpperCase()}</span>
            <div className="hero-visual-caption"><small>{heroCreator.role}</small><strong>{heroCreator.name}</strong><span className="hero-creator-clip-title">{heroCreator.clipTitle}</span></div>
          </div>
          <div className="hero-visual-footer"><div><small>FEATURED CREATOR</small><strong>{heroCreator.name}</strong></div><div><small>CLIP FORMAT</small><strong>{heroCreator.videoProvider.toUpperCase()} · 9:16</strong></div><a className="hero-visual-play" href={heroCreator.clipUrl} target="_blank" rel="noopener noreferrer">View source</a></div>
          <div className="hero-creator-tabs" role="group" aria-label="Choose a featured creator">{HERO_CREATORS.map(creator => <button type="button" key={creator.slug} aria-pressed={heroCreator.slug === creator.slug} onClick={() => setHeroCreatorSlug(creator.slug)}><span aria-hidden="true">{creatorInitials(creator.name)}</span><span>{creator.name}</span></button>)}</div>
        </div>
      </div>
    </section>

    <GlobalCreatorShowcase/>
    <section className="opus-proof"><span>BUILT FOR THE CLIP ECONOMY</span><i/><span>9:16 READY</span><i/><span>CREATOR REVIEW</span><i/><span>REWARD THE WORK</span></section>
    <section className="capsule-journey" aria-labelledby="capsule-journey-title"><div className="capsule-heading"><span className="opus-kicker">THE PUMPCLIP LOOP / 002</span><h2 id="capsule-journey-title">One capsule.<br/><em>Everywhere it needs to go.</em></h2><p>From source upload to a paid, published moment, the PumpClip capsule carries the work forward.</p></div><div className="capsule-track" aria-label="Animated five-step capsule journey"><div className="capsule-line"/><span className="journey-capsule" aria-hidden="true"><i/><b/></span>{[['UPLOAD', 'Capsule enters the logo.', 'upload'], ['PUMP ENGINE', 'Capsule crosses the timeline.', 'process'], ['FEATURED MOMENT', 'Capsule splits into a clip.', 'split'], ['PUBLISHED', 'Capsule shoots outward.', 'publish'], ['EARNINGS', 'Capsule becomes a glowing token.', 'reward']].map(([label, copy, key], index) => <article className={'journey-step ' + key} key={label}><div className="journey-icon"><span/></div><span className="journey-index">0{index + 1}</span><strong>{label}</strong><p>{copy}</p></article>)}</div></section>

    <CreatorClipRail/>

    {(!ready || visiblePeople.length > 0) && <section className="opus-network opus-top-creators"><div className="opus-section-heading"><div><span className="opus-kicker">THE PUMPCLIP NETWORK / PUBLIC PROFILES</span><h2>Real creators.<br/><em>Real community signal.</em></h2></div><a href="/people">View all people</a></div><div className="opus-people-grid opus-people-grid-rich">{visiblePeople.length ? visiblePeople.map(person => {
      const rewards = Number(person.earned_lamports || 0);
      const roleLabels = person.roles.map(role => role === 'streamer' ? 'Creator' : 'Clipper').join(' · ') || 'Creator';
      const metric = rewards > 0 ? earnedSol(rewards) : compact(Number(person.total_views || 0));
      const metricLabel = rewards > 0 ? 'Earned in SOL' : 'Total views';
      return <a className="opus-person" key={person.id} href={'/profile/' + person.id}>
        <span className="opus-person-avatar"><span className="opus-person-initials" aria-hidden="true">{creatorInitials(person.display_name)}</span>{person.avatar_url && <img src={person.avatar_url} alt="" width={256} height={256} loading="lazy" decoding="async" onError={event => {event.currentTarget.style.display = 'none';}}/>}</span>
        <span className="opus-person-identity"><strong title={person.display_name}>{person.display_name}</strong><small title={roleLabels}>{roleLabels}</small></span>
        <span className="opus-person-metric"><strong>{metric}</strong><small>{metricLabel}</small></span>
      </a>;
    }) : Array.from({length: 6}).map((_, index) => <div className="opus-person opus-person-skeleton" key={index}><span className="skeleton-avatar"/><div><span className="skeleton-line wide"/><span className="skeleton-line"/></div></div>)}</div><div className="opus-logo-ticker" aria-label="Supported creator platforms">{logos.map(logo => <span key={logo}>{logo}</span>)}</div></section>}

    <footer className="opus-footer"><a className="opus-logo" href="/" aria-label="pumpclips home"><img src="/logo.svg" alt="" width={1024} height={1024}/><span>pumpclips</span></a><span>Creator-led clips. Public sources. Clear rewards.</span></footer>
  </main>;
}
