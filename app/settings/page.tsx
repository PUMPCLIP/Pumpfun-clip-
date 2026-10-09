'use client';

import {FormEvent,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import './settings.css';
import WalletConnect from '@/app/wallet-connect';

type Account={
  id:string;email:string;name:string;roles:string[];wallet?:string;
  publicHandle?:string|null;pumpfunUrl?:string;avatarUrl?:string|null;
  access:{status:string};config:{network:string;solTreasury?:string};csrf:string;
};

const accessLabels:Record<string,string>={
  eligible:'Token access eligible',insufficient:'Token balance below requirement',
  unconfigured:'Wallet connected; token configuration unavailable',wallet_required:'Connect a wallet to check eligibility',
  rpc_unavailable:'Network check temporarily unavailable',
};

export default function SettingsPage(){
  const [account,setAccount]=useState<Account|null>(null),[loading,setLoading]=useState(true);
  const [error,setError]=useState(''),[notice,setNotice]=useState('');
  const [name,setName]=useState(''),[handle,setHandle]=useState(''),[pumpfunUrl,setPumpfunUrl]=useState('');
  const [savingProfile,setSavingProfile]=useState(false),[uploadingAvatar,setUploadingAvatar]=useState(false);
  const [removingAvatar,setRemovingAvatar]=useState(false),[signingOut,setSigningOut]=useState(false),[deletingAccount,setDeletingAccount]=useState(false);
  const avatarInput=useRef<HTMLInputElement>(null);

  async function loadAccount(){
    setLoading(true);setError('');
    try{
      const response=await fetch('/api/v1/me',{cache:'no-store'});
      if(response.status===401){setAccount(null);return;}
      if(!response.ok)throw new Error('Could not load account details. Please try again.');
      const data=await response.json() as Account;
      setAccount(data);setName(data.name||'');setHandle(data.publicHandle||'');setPumpfunUrl(data.pumpfunUrl||'');
    }catch(cause){setError(cause instanceof Error?cause.message:'Could not load account details.');}
    finally{setLoading(false);}
  }
  useEffect(()=>{void loadAccount();},[]);

  async function saveProfile(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!account)return;
    setSavingProfile(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/v1/me/profile',{method:'PATCH',headers:{'content-type':'application/json','x-csrf-token':account.csrf},body:JSON.stringify({displayName:name,publicHandle:handle,pumpfunUrl})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.message||data.code||'Could not save your profile. Please try again.');
      setAccount({...account,name:data.name,publicHandle:data.publicHandle,pumpfunUrl:data.pumpfunUrl||''});
      setName(data.name);setHandle(data.publicHandle);setPumpfunUrl(data.pumpfunUrl||'');
      setNotice('Profile saved. Your public name, handle, and Pump.fun link are updated.');
    }catch(cause){setError(cause instanceof Error?cause.message:'Could not save your profile.');}
    finally{setSavingProfile(false);}
  }

  async function uploadAvatar(file?:File){
    if(!account||!file)return;
    if(file.size>5*1024*1024){setError('Avatar files must be 5 MB or smaller.');return;}
    setUploadingAvatar(true);setError('');setNotice('');
    try{
      const form=new FormData();form.append('avatar',file);
      const response=await fetch('/api/v1/me/avatar',{method:'POST',headers:{'x-csrf-token':account.csrf},body:form});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.message||data.code||'Could not upload your avatar.');
      setAccount({...account,avatarUrl:data.avatarUrl});setNotice('Avatar updated and visible on your public profile.');
    }catch(cause){setError(cause instanceof Error?cause.message:'Could not upload your avatar.');}
    finally{setUploadingAvatar(false);if(avatarInput.current)avatarInput.current.value='';}
  }

  async function removeAvatar(){
    if(!account)return;
    setRemovingAvatar(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/v1/me/avatar',{method:'DELETE',headers:{'x-csrf-token':account.csrf}});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.message||data.code||'Could not remove your avatar.');
      setAccount({...account,avatarUrl:null});setNotice('Avatar removed. Your profile portrait is back to its default.');
    }catch(cause){setError(cause instanceof Error?cause.message:'Could not remove your avatar.');}
    finally{setRemovingAvatar(false);}
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

  async function deleteAccount(){
    if(!account||deletingAccount)return;
    const ok=window.confirm('Delete your PumpClip account? Your sign-in and public profile will be removed. Campaigns, submissions, rewards, and payment/audit records will remain under a generic Deleted user identity.');
    if(!ok)return;
    if(window.prompt('This cannot be undone. Type DELETE to confirm account deletion:')!=='DELETE')return;
    setDeletingAccount(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/v1/me',{method:'DELETE',headers:{'content-type':'application/json','x-csrf-token':account.csrf},body:JSON.stringify({confirmation:'DELETE'})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.message||data.code||'Could not delete this account. Please try again.');
      window.location.replace('/auth?deleted=1');
    }catch(cause){setError(cause instanceof Error?cause.message:'Could not delete this account.');setDeletingAccount(false);}
  }

  return <main className="settings-page">
    <header className="settings-header"><Link className="settings-brand" href="/">PUMP<span>CLIP</span></Link><nav aria-label="Account navigation"><Link href="/dashboard">Workspace</Link><Link href="/discover">Discover</Link></nav></header>
    <section className="settings-shell">
      <div className="settings-heading"><p className="settings-eyebrow">ACCOUNT</p><h1>Settings<span>.</span></h1><p>Manage your sign-in, public profile, avatar, and connected Pump.fun details.</p></div>
      {loading?<div className="settings-state" role="status">Loading account details…</div>:null}
      {!loading&&!account&&!error?<div className="settings-card settings-guest"><h2>Sign in to view your account</h2><p>Your profile, connected wallet, and access status appear here after authentication.</p><Link className="settings-primary" href="/auth">Sign in</Link></div>:null}
      {error?<div className="settings-alert" role="alert">{error}<button type="button" onClick={()=>void loadAccount()}>Retry</button></div>:null}
      {notice?<p className="settings-success" role="status" aria-live="polite">{notice}</p>:null}
      {account&&<>
        <section className="settings-card settings-avatar-card">
          <div className="settings-card-head"><div><p className="settings-eyebrow">PROFILE IMAGE</p><h2>Your avatar</h2></div><span className="settings-visible">PUBLIC</span></div>
          <div className="settings-avatar-row"><div className="settings-avatar-preview">{account.avatarUrl?<img src={account.avatarUrl} alt="Current profile avatar"/>:<span aria-hidden="true">{account.name.slice(0,2).toUpperCase()}</span>}</div><div className="settings-avatar-copy"><p>Upload a JPEG, PNG, or WebP image up to 5 MB. It is normalized to a safe 512px WebP before storage.</p><div className="settings-avatar-actions"><input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose profile avatar" onChange={event=>void uploadAvatar(event.target.files?.[0])}/><button className="settings-primary" type="button" onClick={()=>avatarInput.current?.click()} disabled={uploadingAvatar}>{uploadingAvatar?'Uploading…':'Upload avatar'}</button>{account.avatarUrl&&<button className="settings-secondary" type="button" onClick={()=>void removeAvatar()} disabled={removingAvatar}>{removingAvatar?'Removing…':'Remove avatar'}</button>}</div></div></div>
        </section>
        <section className="settings-card settings-profile-card">
          <div className="settings-card-head"><div><p className="settings-eyebrow">YOUR PUBLIC IDENTITY</p><h2>Profile details</h2></div><span className="settings-visible">PUBLIC</span></div>
          <p className="settings-profile-intro">Choose the name and handle that appear on your profile, in the people directory, and in your workspace.</p>
          <form className="settings-profile-form" onSubmit={saveProfile}>
            <label>Display name<input required minLength={1} maxLength={100} value={name} onChange={event=>setName(event.target.value)} autoComplete="name"/></label>
            <label>Public handle<div className="settings-handle-input"><span>@</span><input required minLength={3} maxLength={24} pattern="[A-Za-z0-9][A-Za-z0-9_-]*" value={handle} onChange={event=>setHandle(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g,''))} placeholder="yourname" autoComplete="username"/></div></label>
            <label className="settings-pumpfun-field">Pump.fun public profile URL<input type="url" maxLength={300} value={pumpfunUrl} onChange={event=>setPumpfunUrl(event.target.value)} placeholder="https://pump.fun/…" autoComplete="url"/></label>
            <p className="settings-handle-help">Handles are unique and public. Pump.fun links must use its HTTPS domain; this is a profile link, not Pump.fun sign-in or account verification.</p>
            <div className="settings-profile-actions"><button className="settings-primary" type="submit" disabled={savingProfile}>{savingProfile?'Saving…':'Save profile'}</button>{account.publicHandle&&<Link className="settings-secondary" href={`/profile/${account.id}`}>View my public profile ↗</Link>}</div>
          </form>
        </section>
        <div className="settings-grid">
          <section className="settings-card"><div className="settings-card-head"><div><p className="settings-eyebrow">ACCOUNT</p><h2>Account details</h2></div><span className="settings-readonly">SECURE</span></div><dl className="settings-list"><div><dt>Email</dt><dd className="settings-email">{account.email}</dd></div><div><dt>Roles</dt><dd>{account.roles?.length?account.roles.map(role=><span className="settings-chip" key={role}>{role}</span>):<span className="settings-muted">No role assigned</span>}</dd></div><div><dt>Account ID</dt><dd className="settings-mono">{account.id.slice(0,8)}…</dd></div></dl></section>
          <section className="settings-card"><div className="settings-card-head"><div><p className="settings-eyebrow">ACCESS</p><h2>Wallet & eligibility</h2></div><span className="settings-dot" aria-hidden="true"/></div><dl className="settings-list"><div><dt>Wallet</dt><dd className="settings-mono">{account.wallet||'Not connected'}</dd></div><div><dt>Network</dt><dd>{account.config?.network||'Not configured'}</dd></div><div><dt>Token access</dt><dd><span className="settings-status">{accessLabels[account.access?.status]||account.access?.status||'Unknown'}</span></dd></div></dl><p className="settings-note">Access status is a snapshot from the connected wallet and network configuration.</p><WalletConnect currentWallet={account.wallet} network={account.config?.network||'devnet'} treasuryAddress={account.config?.solTreasury} csrf={account.csrf} onLinked={()=>void loadAccount()}/></section>
        </div>
        <section className="settings-card settings-session"><div><p className="settings-eyebrow">SESSION</p><h2>Sign out of this device</h2><p>Signing out revokes the current PumpClip session on this browser.</p></div><button className="settings-secondary" type="button" onClick={()=>void signOut()} disabled={signingOut}>{signingOut?'Signing out…':'Sign out'}</button></section>
        <section className="settings-card settings-danger"><div><p className="settings-eyebrow">PERMANENT ACTION</p><h2>Delete your account</h2><p>Signing in will be disabled, your public profile, avatar, wallet links, and follows will be removed, and your identity will be anonymized. Campaign, submission, reward, payment, and audit history is retained as required for platform integrity.</p><button className="settings-danger-button" type="button" onClick={()=>void deleteAccount()} disabled={deletingAccount}>{deletingAccount?'Deleting account…':'Delete account'}</button></div></section>
      </>}
    </section>
  </main>;
}
