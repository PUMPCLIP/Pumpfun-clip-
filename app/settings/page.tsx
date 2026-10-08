'use client';

import {FormEvent,useEffect,useState} from 'react';
import Link from 'next/link';
import './settings.css';

type Account={
  id:string;email:string;name:string;roles:string[];wallet?:string;
  publicHandle?:string|null;
  access:{status:string};config:{network:string};csrf:string;
};

const accessLabels:Record<string,string>={
  eligible:'Token access eligible',
  insufficient:'Token balance below requirement',
  unconfigured:'Wallet connected; token configuration unavailable',
  wallet_required:'Connect a wallet to check eligibility',
  rpc_unavailable:'Network check temporarily unavailable',
};

export default function SettingsPage(){
  const [account,setAccount]=useState<Account|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [name,setName]=useState('');
  const [handle,setHandle]=useState('');
  const [savingProfile,setSavingProfile]=useState(false);
  const [signingOut,setSigningOut]=useState(false);
  async function loadAccount(){
    setLoading(true);setError('');
    try{
      const response=await fetch('/api/v1/me',{cache:'no-store'});
      if(response.status===401){setAccount(null);return;}
      if(!response.ok)throw new Error('Could not load account details. Please try again.');
      const data=await response.json() as Account;
      setAccount(data);setName(data.name||'');setHandle(data.publicHandle||'');
    }catch(cause){setError(cause instanceof Error?cause.message:'Could not load account details.');}
    finally{setLoading(false);}
  }
  useEffect(()=>{void loadAccount();},[]);
  async function saveProfile(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!account)return;
    setSavingProfile(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/v1/me/profile',{method:'PATCH',headers:{'content-type':'application/json','x-csrf-token':account.csrf},body:JSON.stringify({displayName:name,publicHandle:handle})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.message||data.code||'Could not save your profile. Please try again.');
      setAccount({...account,name:data.name,publicHandle:data.publicHandle});
      setName(data.name);setHandle(data.publicHandle);
      setNotice('Profile saved. Your public profile is ready to view.');
    }catch(cause){setError(cause instanceof Error?cause.message:'Could not save your profile.');}
    finally{setSavingProfile(false);}
  }
  async function signOut(){
    if(!account)return;
    setSigningOut(true);setError('');
    try{
      const response=await fetch('/api/v1/auth/logout',{method:'POST',headers:{'x-csrf-token':account.csrf}});
      if(!response.ok)throw new Error('Could not sign out. Please try again.');
      window.location.assign('/auth');
    }catch(cause){setError(cause instanceof Error?cause.message:'Could not sign out.');setSigningOut(false);}
  }
  return <main className="settings-page">
    <header className="settings-header">
      <Link className="settings-brand" href="/">PUMP<span>CLIP</span></Link>
      <nav aria-label="Account navigation">
        <Link href="/dashboard">Workspace</Link>
        <Link href="/discover">Discover</Link>
      </nav>
    </header>
    <section className="settings-shell">
      <div className="settings-heading">
        <p className="settings-eyebrow">ACCOUNT</p>
        <h1>Settings<span>.</span></h1>
        <p>Manage the name and public profile people see across pumpclips.</p>
      </div>
      {loading?<div className="settings-state" role="status">Loading account details…</div>:null}
      {!loading&&!account&&!error?<div className="settings-card settings-guest">
        <h2>Sign in to view your account</h2>
        <p>Your profile, connected wallet, and access status appear here after authentication.</p>
        <Link className="settings-primary" href="/auth">Sign in</Link>
      </div>:null}
      {error?<div className="settings-alert" role="alert">{error}<button type="button" onClick={()=>void loadAccount()}>Retry</button></div>:null}
      {notice?<p className="settings-success" role="status" aria-live="polite">{notice}</p>:null}
      {account? <>
        <section className="settings-card settings-profile-card">
          <div className="settings-card-head"><div><p className="settings-eyebrow">YOUR PUBLIC IDENTITY</p><h2>Profile details</h2></div><span className="settings-visible">PUBLIC</span></div>
          <p className="settings-profile-intro">Choose the name and handle that appear on your profile, in the people directory, and in your workspace.</p>
          <form className="settings-profile-form" onSubmit={saveProfile}>
            <label>Display name<input required minLength={1} maxLength={100} value={name} onChange={event=>setName(event.target.value)} autoComplete="name"/></label>
            <label>Public handle<div className="settings-handle-input"><span>@</span><input required minLength={3} maxLength={24} pattern="[A-Za-z0-9][A-Za-z0-9_-]*" value={handle} onChange={event=>setHandle(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g,''))} placeholder="yourname" autoComplete="username"/></div></label>
            <p className="settings-handle-help">3–24 characters; letters, numbers, underscores, and hyphens. Handles are unique and public.</p>
            <div className="settings-profile-actions"><button className="settings-primary" type="submit" disabled={savingProfile}>{savingProfile?'Saving…':'Save profile'}</button>{account.publicHandle&&<Link className="settings-secondary" href={`/profile/${account.id}`}>View my public profile ↗</Link>}</div>
          </form>
        </section>
        <div className="settings-grid">
          <section className="settings-card">
            <div className="settings-card-head"><div><p className="settings-eyebrow">ACCOUNT</p><h2>Account details</h2></div><span className="settings-readonly">SECURE</span></div>
            <dl className="settings-list">
              <div><dt>Email</dt><dd className="settings-email">{account.email}</dd></div>
              <div><dt>Roles</dt><dd>{account.roles?.length?account.roles.map(role=><span className="settings-chip" key={role}>{role}</span>):<span className="settings-muted">No role assigned</span>}</dd></div>
              <div><dt>Account ID</dt><dd className="settings-mono">{account.id.slice(0,8)}…</dd></div>
            </dl>
          </section>
          <section className="settings-card">
            <div className="settings-card-head"><div><p className="settings-eyebrow">ACCESS</p><h2>Wallet & eligibility</h2></div><span className="settings-dot" aria-hidden="true"/></div>
            <dl className="settings-list">
              <div><dt>Wallet</dt><dd className="settings-mono">{account.wallet||'Not connected'}</dd></div>
              <div><dt>Network</dt><dd>{account.config?.network||'Not configured'}</dd></div>
              <div><dt>Token access</dt><dd><span className="settings-status">{accessLabels[account.access?.status]||account.access?.status||'Unknown'}</span></dd></div>
            </dl>
            <p className="settings-note">Access status is a snapshot from the connected wallet and network configuration.</p>
          </section>
        </div>
        <section className="settings-card settings-session">
          <div><p className="settings-eyebrow">SESSION</p><h2>Sign out of this device</h2><p>Signing out revokes the current PumpClip session on this browser.</p></div>
          <button className="settings-secondary" type="button" onClick={()=>void signOut()} disabled={signingOut}>{signingOut?'Signing out…':'Sign out'}</button>
        </section>
      </>:null}
    </section>
  </main>;
}
