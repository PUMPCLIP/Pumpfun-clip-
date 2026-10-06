'use client';

import {useEffect,useState} from 'react';
import Link from 'next/link';
import './settings.css';

type Account={
  id:string;email:string;name:string;roles:string[];wallet?:string;
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
  const [signingOut,setSigningOut]=useState(false);
  async function loadAccount(){
    setLoading(true);setError('');
    try{
      const response=await fetch('/api/v1/me',{cache:'no-store'});
      if(response.status===401){setAccount(null);return;}
      if(!response.ok)throw new Error('Could not load account details. Please try again.');
      setAccount(await response.json() as Account);
    }catch(cause){setError(cause instanceof Error?cause.message:'Could not load account details.');}
    finally{setLoading(false);}
  }
  useEffect(()=>{void loadAccount();},[]);
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
        <p>Review your PumpClip profile and current access status.</p>
      </div>
      {loading?<div className="settings-state" role="status">Loading account details…</div>:null}
      {!loading&&!account&&!error?<div className="settings-card settings-guest">
        <h2>Sign in to view your account</h2>
        <p>Your profile, connected wallet, and access status appear here after authentication.</p>
        <Link className="settings-primary" href="/auth">Sign in</Link>
      </div>:null}
      {error?<div className="settings-alert" role="alert">{error}<button type="button" onClick={()=>void loadAccount()}>Retry</button></div>:null}
      {account?<>
        <div className="settings-grid">
          <section className="settings-card">
            <div className="settings-card-head"><div><p className="settings-eyebrow">PROFILE</p><h2>Account details</h2></div><span className="settings-readonly">READ ONLY</span></div>
            <dl className="settings-list">
              <div><dt>Name</dt><dd>{account.name||'—'}</dd></div>
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
        <p className="settings-footnote">Profile editing and notification preferences are not currently available in this app.</p>
      </>:null}
    </section>
  </main>;
}
