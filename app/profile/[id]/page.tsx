'use client';

import {useEffect,useState} from 'react';
import {creatorPortrait} from '@/lib/creator-images';

type Work={id:string;campaign_title:string;target_platforms:string[];video_url:string;view_count:number;like_count:number};
type Activity={id:string;type:'work'|'campaign'|'follow';title:string;description:string;created_at:string;href:string};
type Connection={id:string;display_name:string;public_handle:string;roles:string[];avatar_url:string|null};
type Profile={
  id:string;display_name:string;public_handle?:string;avatar_url:string|null;
  social_links?:Record<string,string>;roles:string[];accepted_count:number;total_views:number;reputation_score:number;
  followers_count:number;following_count:number;is_own_profile:boolean;viewer_signed_in:boolean;viewer_follows:boolean;
  works:Work[];activities:Activity[];
};
const socialOrder=['pumpfun','youtube','tiktok','twitch','kick'] as const;
const socialLabel:Record<string,string>={pumpfun:'Pump.fun',youtube:'YouTube',tiktok:'TikTok',twitch:'Twitch',kick:'Kick'};
const csrf=()=>decodeURIComponent(document.cookie.split('; ').find(cookie=>cookie.startsWith('pc_csrf='))?.split('=')[1]||'');

export default function ProfilePage(){
  const [profile,setProfile]=useState<Profile|null>(null),[error,setError]=useState('');
  const [connections,setConnections]=useState<Connection[]|null>(null),[connectionType,setConnectionType]=useState<'followers'|'following'|null>(null);
  const [working,setWorking]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    const id=location.pathname.split('/').pop()||'';
    const timer=window.setTimeout(()=>controller.abort(),10000);
    fetch('/api/v1/profiles/'+encodeURIComponent(id),{signal:controller.signal,cache:'no-store'})
      .then(response=>response.ok?response.json():Promise.reject(new Error('profile')))
      .then(setProfile).catch(caught=>{if((caught as Error)?.name!=='AbortError')setError('Profile not found.');})
      .finally(()=>window.clearTimeout(timer));
    return()=>{window.clearTimeout(timer);controller.abort();};
  },[]);

  async function toggleFollow(){
    if(!profile||working)return;
    setWorking(true);setError('');
    try{
      const response=await fetch(`/api/v1/profiles/${encodeURIComponent(profile.id)}/follow`,{
        method:profile.viewer_follows?'DELETE':'POST',headers:{'x-csrf-token':csrf()},
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.message||'Could not update this follow. Please retry.');
      setProfile({...profile,viewer_follows:data.following,followers_count:data.followersCount,following_count:data.followingCount});
    }catch(caught){setError(caught instanceof Error?caught.message:'Could not update this follow.');}
    finally{setWorking(false);}
  }

  async function showConnections(type:'followers'|'following'){
    if(!profile)return;
    setConnectionType(type);setConnections(null);setError('');
    try{
      const response=await fetch(`/api/v1/profiles/${encodeURIComponent(profile.id)}/connections?type=${type}`,{cache:'no-store'});
      const data=await response.json();
      if(!response.ok)throw new Error(data.message||'Could not load this list.');
      setConnections(data.items||[]);
    }catch(caught){setError(caught instanceof Error?caught.message:'Could not load this list.');setConnectionType(null);}
  }

  if(error&&!profile)return <main className="profile-shell profile-error"><a className="back" href="/people">← Back to people</a><h1>{error}</h1><p>This public profile may have been removed or is not available yet.</p><a className="profile-action" href="/people">Browse people ↗</a></main>;
  if(!profile)return <main className="profile-shell profile-loading" role="status" aria-live="polite"><p>Loading profile…</p></main>;
  const works=profile.works||[],activities=profile.activities||[];
  return <main className="profile-shell">
    <header className="profile-header">
      <div className="profile-header-main">
        <a className="back" href="/people">← People directory</a>
        <div className="profile-identity">
          <img src={profile.avatar_url||creatorPortrait(profile.id)} alt={`${profile.display_name} profile avatar`}
            onError={event=>{event.currentTarget.onerror=null;event.currentTarget.src=creatorPortrait(profile.id);}}/>
          <div><div className="eyebrow">CREATOR / CLIPPER PROFILE</div><h1>{profile.display_name}</h1>{profile.public_handle&&<p className="profile-handle">@{profile.public_handle}</p>}</div>
        </div>
        <p>{profile.roles.map(role=>role.toUpperCase()).join(' · ')}</p>
        <div className="profile-socials">{socialOrder.filter(key=>profile.social_links?.[key]).map(key=><a key={key} href={profile.social_links![key]} target="_blank" rel="noreferrer">{socialLabel[key]} ↗</a>)}</div>
        <div className="profile-social-actions">
          {profile.is_own_profile?<a className="profile-action" href="/settings">Edit profile & settings ↗</a>:profile.viewer_signed_in?
            <button type="button" className="profile-follow-button" onClick={()=>void toggleFollow()} disabled={working} aria-pressed={profile.viewer_follows}>{working?'Saving…':profile.viewer_follows?'Following · Unfollow':'＋ Follow'}</button>:
            <a className="profile-follow-button" href="/auth">Sign in to follow ↗</a>}
        </div>
      </div>
      <div className="reputation"><strong>{Number(profile.reputation_score).toFixed(1)}</strong><span>REPUTATION</span></div>
    </header>
    {error&&<p className="profile-inline-error" role="alert">{error}</p>}
    <section className="profile-stats" aria-label="Profile statistics">
      <div><strong>{profile.accepted_count}</strong><span>ACCEPTED CUTS</span></div>
      <div><strong>{Number(profile.total_views).toLocaleString()}</strong><span>TOTAL VIEWS</span></div>
      <div><strong>{profile.roles.includes('streamer')?'CREATOR':'CLIPPER'}</strong><span>ROLE</span></div>
      <div><strong>{profile.followers_count}</strong><span>FOLLOWERS</span><button type="button" onClick={()=>void showConnections('followers')}>View people</button></div>
      <div><strong>{profile.following_count}</strong><span>FOLLOWING</span><button type="button" onClick={()=>void showConnections('following')}>View people</button></div>
    </section>
    <section className="profile-activity" aria-labelledby="profile-activity-title">
      <div className="eyebrow">PUBLIC PROFILE / RECENT ACTIVITY</div><h2 id="profile-activity-title">Activity</h2>
      {activities.length===0?<div className="profile-work-empty">Public campaign, accepted-work, and follow activity will appear here.</div>:
        <ol className="profile-activity-list">{activities.map(activity=><li key={`${activity.type}:${activity.id}`}>
          <span className="profile-activity-mark" aria-hidden="true">{activity.type==='work'?'▶':activity.type==='campaign'?'▣':'＋'}</span>
          <div><strong>{activity.title}</strong><p>{activity.description}</p><time dateTime={activity.created_at}>{new Date(activity.created_at).toLocaleString()}</time></div>
        </li>)}</ol>}
    </section>
    <section className="profile-works" aria-labelledby="accepted-works-title">
      <div className="eyebrow">WORK HISTORY / {String(works.length).padStart(2,'0')}</div><h2 id="accepted-works-title">Accepted works</h2>
      {works.length===0?<div className="profile-work-empty">No accepted works are public yet. Check back when this profile publishes its first cut.</div>:
        <div className="profile-grid">{works.map(work=><article key={work.id}><video src={work.video_url} controls playsInline preload="metadata" aria-label={`${work.campaign_title} video`}/><div><strong>{work.campaign_title}</strong><span>{work.target_platforms?.join(' · ')||'Accepted cut'}</span><small>◉ {Number(work.view_count||0).toLocaleString()} views</small></div></article>)}</div>}
    </section>
    {connectionType&&<div className="profile-modal-backdrop" onClick={()=>{setConnectionType(null);setConnections(null);}}>
      <section className="profile-connections-modal" role="dialog" aria-modal="true" aria-labelledby="profile-connections-title" onClick={event=>event.stopPropagation()}>
        <div className="profile-connections-head"><div><div className="eyebrow">CREATOR NETWORK</div><h2 id="profile-connections-title">{connectionType==='followers'?'Followers':'Following'}</h2></div><button type="button" aria-label="Close list" onClick={()=>{setConnectionType(null);setConnections(null);}}>×</button></div>
        {connections===null?<p role="status">Loading people…</p>:connections.length===0?<p className="profile-work-empty">No public profiles in this list yet.</p>:<ul className="profile-connections-list">{connections.map(person=><li key={person.id}><a href={`/profile/${person.id}`}><img src={person.avatar_url||creatorPortrait(person.id)} alt="" onError={event=>{event.currentTarget.onerror=null;event.currentTarget.src=creatorPortrait(person.id);}}/><span><strong>{person.display_name}</strong><small>@{person.public_handle}</small></span><span className="profile-connection-role">{person.roles.join(' · ')}</span></a></li>)}</ul>}
      </section>
    </div>}
  </main>;
}
