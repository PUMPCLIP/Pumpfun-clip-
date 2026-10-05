'use client';
import {FormEvent,useEffect,useState} from 'react';
import {useLogin,usePrivy} from '@privy-io/react-auth';

function PrivyAuthPanel({email}:{email:string}){
  const [error,setError]=useState('');
  const {login}=useLogin({onComplete:()=>{window.location.href='/dashboard';},onError:(error:unknown)=>setError(String((error as {message?:string})?.message||error))} as any);
  const {ready,authenticated}=usePrivy();
  const start=()=>{setError('');login(({prefill:email.trim()?{type:'email',value:email.trim()}:undefined} as any));};
  if(authenticated) return <div className="auth-ready"><strong>You are already signed in.</strong><a className="auth-primary" href="/dashboard">Open workspace <span>↗</span></a></div>;
  return <div className="auth-actions">
    <button className="auth-primary" onClick={start} disabled={!ready}>{ready?'Continue with pumpclips':'Loading secure sign-in…'} <span>↗</span></button>
    <p className="auth-helper">Email, Google, X, TikTok, Twitch, and Solana wallet sign-in are handled securely by Privy. Kick can be enabled once its OAuth provider is configured in Privy.</p>
    {error&&<p className="auth-error" role="alert">{error}. Please try again.</p>}
  </div>;
}

function GoogleFallback(){
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const start=async()=>{
    setBusy(true);setMessage('');
    try{
      const response=await fetch('/api/v1/auth/google/start',{redirect:'manual'});
      if(response.type==='opaqueredirect'||response.status===0){window.location.href='/api/v1/auth/google/start';return;}
      if(!response.ok){const body=await response.json().catch(()=>({}));setMessage(body.code==='GOOGLE_NOT_CONFIGURED'?'Google sign-in is being connected. Use the secure Privy sign-in when it is enabled.':'Sign-in is temporarily unavailable.');setBusy(false);return;}
      window.location.href=response.url||'/api/v1/auth/google/start';
    }catch{setMessage('Sign-in is temporarily unavailable. Please try again.');setBusy(false);}
  };
  return <div className="auth-actions"><button className="auth-primary" onClick={start} disabled={busy}>{busy?'Connecting…':'Continue with Google'} <span>↗</span></button><p className="auth-helper">Your account is protected with encrypted sessions and a seven-day sign-in.</p>{message&&<p className="auth-error" role="alert">{message}</p>}</div>;
}

export default function AuthPage(){
  const hasPrivy=Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);
  const [mode,setMode]=useState<'signin'|'signup'>('signin');
  const [email,setEmail]=useState('');
  const [note,setNote]=useState('');
  const [role,setRole]=useState<'streamer'|'clipper'>('clipper');
  useEffect(()=>{const saved=window.localStorage.getItem('pumpclips_signup_role');if(saved==='streamer'||saved==='clipper')setRole(saved);},[]);
  const chooseRole=(value:'streamer'|'clipper')=>{setRole(value);window.localStorage.setItem('pumpclips_signup_role',value);};
  useEffect(()=>{const params=new URLSearchParams(window.location.search);if(params.get('mode')==='signup')setMode('signup');const requestedRole=params.get('role');if(requestedRole==='streamer'||requestedRole==='clipper'){setRole(requestedRole);window.localStorage.setItem('pumpclips_signup_role',requestedRole);}const error=params.get('error');if(error==='google_not_configured')setNote('Google sign-in is not configured on this deployment yet. Use the secure sign-in provider below once it is enabled.');if(error==='oauth_failed'||error==='oauth_state')setNote('That sign-in attempt expired or could not be verified. Please try again.');},[]);
  const submit=(event:FormEvent)=>{event.preventDefault();if(!email.trim()){setNote('Enter your email to continue.');return;}setNote('Choose the secure sign-in button below to finish creating your account.');};
  return <main className="auth-page">
    <header className="auth-header"><a className="auth-brand" href="/"><img src="/pumpclips-mark.jpg" alt=""/><span>pumpclips</span></a><a className="auth-back" href="/">Back to home <span>↗</span></a></header>
    <section className="auth-layout"><div className="auth-story"><span className="auth-kicker">PUMPCLIPS / CREATOR NETWORK</span><h1>Make your<br/><em>next move.</em></h1><p>One account for creators, clippers, campaigns, and rewards. Start with the workspace that keeps the work moving.</p><div className="auth-proof"><span>01</span><p><strong>Source to signal.</strong><br/>Bring long-form video into a network built around the moment that matters.</p></div><div className="auth-proof"><span>02</span><p><strong>Work with trust.</strong><br/>Clear briefs, visible profiles, and rewards that follow the work.</p></div></div>
      <div className="auth-card"><div className="auth-tabs" role="tablist"><button className={mode==='signin'?'active':''} onClick={()=>{setMode('signin');setNote('')}}>Sign in</button><button className={mode==='signup'?'active':''} onClick={()=>{setMode('signup');setNote('')}}>Create account</button></div><div className="auth-card-heading"><span className="auth-kicker">{mode==='signin'?'WELCOME BACK':'JOIN THE NETWORK'}</span><h2>{mode==='signin'?'Get back to the work.':'Build your account.'}</h2><p>{mode==='signin'?'Pick up your campaigns, cuts, and conversations.':'Create one secure account and choose your role as you go.'}</p></div>{mode==='signup'&&<div className="role-picker" aria-label="Choose your role"><button type="button" className={role==='clipper'?'selected':''} onClick={()=>chooseRole('clipper')}><strong>Clipper</strong><span>Find moments, publish cuts, earn.</span></button><button type="button" className={role==='streamer'?'selected':''} onClick={()=>chooseRole('streamer')}><strong>Streamer</strong><span>Launch a pump, grow your reach.</span></button></div>}<form className="auth-email-form" onSubmit={submit}><label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@studio.com" autoComplete="email"/></label><button className="auth-secondary" type="submit">{mode==='signin'?'Continue with email':'Start with email'} <span>↗</span></button></form>{note&&<p className="auth-note" role="status">{note}</p>}<div className="auth-divider"><span>or continue securely</span></div>{hasPrivy?<PrivyAuthPanel email={email}/>:<GoogleFallback/>}<p className="auth-terms">By continuing, you agree to the pumpclips <a href="/">Terms</a> and <a href="/">Privacy</a>. No seed phrase is ever requested.</p></div></section>
  </main>;
}
