'use client';

import {useEffect, useMemo, useState} from 'react';
import GlobalCreatorShowcase from '@/app/components/global-creator-showcase';

type Person = {
  id: string;
  display_name: string;
  public_handle?: string;
  avatar_url?: string | null;
  social_links?: Record<string, string>;
  roles: string[];
  accepted_count: number;
  total_views: number;
  reputation_score: number;
  campaign_title?: string;
  video_url?: string;
};

const socialOrder = ['youtube', 'tiktok', 'twitch', 'kick'] as const;
const socialLabel: Record<string, string> = {youtube: 'YouTube', tiktok: 'TikTok', twitch: 'Twitch', kick: 'Kick'};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

function compact(value: number) {
  return new Intl.NumberFormat('en', {notation: 'compact', maximumFractionDigits: 1}).format(Number(value || 0));
}

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [role, setRole] = useState<'all' | 'streamer' | 'clipper'>('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 10000);
    fetch('/api/v1/profiles?limit=60', {signal: controller.signal, cache: 'no-store'})
      .then(async response => {
        if (!response.ok) throw new Error('profiles');
        return response.json() as Promise<{items?: Person[]}>;
      })
      .then(data => setPeople(Array.isArray(data.items) ? data.items : []))
      .catch(caught => {
        if ((caught as Error)?.name !== 'AbortError') setError('The people directory is temporarily unavailable. Please try again.');
      })
      .finally(() => {
        window.clearTimeout(timer);
        setLoading(false);
      });
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const visible = useMemo(() => people.filter(person =>
    (role === 'all' || person.roles.includes(role)) &&
    (!normalizedQuery || [person.display_name, person.public_handle || '', ...person.roles].join(' ').toLowerCase().includes(normalizedQuery)),
  ), [people, role, normalizedQuery]);

  return <main className="people-page">
    <header className="people-header">
      <a className="brand official-brand" href="/" aria-label="pumpclips home"><img src="/logo.svg" alt=""/><span>pumpclips</span></a>
      <div><span className="eyebrow">NETWORK / PUBLIC DIRECTORY</span><a className="outline" href="#creator-spotlights">Browse featured creators</a></div>
    </header>

    <section className="people-intro">
      <div><span className="eyebrow">CREATORS + CLIPPERS / {people.length || '—'}</span><h1>The people<br/><em>behind the momentum.</em></h1><p>Meet PumpClip community creators and clippers, then browse public creator channels across culture, fashion, finance, and gaming.</p></div>
      <div className="people-tools">
        <label className="people-search">⌕<input value={query} onChange={event => setQuery(event.target.value)} aria-label="Search people" placeholder="Search creators and clippers"/></label>
        <div className="people-filter" role="tablist" aria-label="Filter community members">
          {([['all', 'Everyone'], ['streamer', 'Creators'], ['clipper', 'Clippers']] as const).map(([key, label]) => <button type="button" role="tab" id={`people-tab-${key}`} aria-controls="people-results" aria-selected={role === key} tabIndex={role === key ? 0 : -1} key={key} className={role === key ? 'active' : ''} onClick={() => setRole(key)}>{label}</button>)}
        </div>
      </div>
    </section>

    <div id="people-results" role="tabpanel" aria-labelledby={`people-tab-${role}`}>
      {loading ? <div className="people-state" role="status" aria-live="polite">Loading the network…</div> : error ? <div className="people-state error" role="alert">{error}</div> : visible.length === 0 ? <div className="people-state">{people.length === 0 ? 'No community profiles yet. Public creator spotlights appear below.' : 'No profiles match these filters. Try another search or role.'}</div> : <section className="people-grid">
        {visible.map(person => {
          const nameInitials = initials(person.display_name);
          const roleLabels = person.roles.map(item => item === 'streamer' ? 'Creator' : 'Clipper').join(' · ') || 'Creator';
          return <a className="directory-card" href={'/profile/' + person.id} key={person.id}>
            <div className="directory-card-top">
              <span className="directory-avatar" aria-label={`${person.display_name} avatar`}>
                <span className="directory-avatar-fallback" aria-hidden="true">{nameInitials}</span>
                {person.avatar_url && <img src={person.avatar_url} alt="" width={256} height={256} loading="lazy" decoding="async" onError={event => {event.currentTarget.style.display = 'none';}}/>}
              </span>
              <span className="directory-role" title={roleLabels}>{roleLabels}</span>
            </div>
            <h2 className="directory-name" title={person.display_name}>{person.display_name}</h2>
            {person.public_handle && <p className="directory-handle" title={`@${person.public_handle}`}>@{person.public_handle}</p>}
            <div className="directory-portrait" aria-label={`${person.display_name} profile image`}>
              <div className="directory-portrait-fallback" aria-hidden="true"><span>{nameInitials}</span><small>Creator profile</small></div>
              {person.avatar_url && <img src={person.avatar_url} alt="" loading="lazy" decoding="async" onError={event => {event.currentTarget.style.display = 'none';}}/>}
            </div>
            <div className="directory-socials" aria-label={`${person.display_name} social links`}>
              {socialOrder.filter(key => person.social_links?.[key]).map(key => <span key={key}>{socialLabel[key]}</span>)}
            </div>
            <div className="directory-stats">
              <span><strong>{Number(person.reputation_score || 0).toFixed(1)}</strong><small>Reputation</small></span>
              <span><strong>{Number(person.accepted_count || 0).toLocaleString()}</strong><small>Accepted cuts</small></span>
              <span><strong>{compact(Number(person.total_views || 0))}</strong><small>Total views</small></span>
            </div>
            {person.video_url ? <div className="directory-video" aria-label={`${person.display_name} accepted work preview`}>
              <span className="directory-video-fallback" aria-hidden="true">{nameInitials}</span>
              {person.avatar_url && <img src={person.avatar_url} alt="" loading="lazy" decoding="async" onError={event => {event.currentTarget.style.display = 'none';}}/>}
              <span className="directory-video-title">{person.campaign_title || 'Accepted work'}</span>
              <span className="directory-video-label">CLIP ON PROFILE</span>
            </div> : <div className="directory-empty">Profile ready for first accepted work.</div>}
          </a>;
        })}
      </section>}
    </div>

    <GlobalCreatorShowcase/>
    <footer><strong className="footer-brand"><img src="/logo.svg" alt=""/> pumpclips</strong><span>Turn moments into momentum.</span></footer>
  </main>;
}
