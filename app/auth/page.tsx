'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Session } from '@supabase/supabase-js';
import PrivyWalletLogin from '../privy-wallet-login';

type AuthNotice = { kind: 'success' | 'error' | 'info'; text: string } | null;

export default function AuthPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'streamer' | 'clipper'>('clipper');
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [appUrl, setAppUrl] = useState('https://pumpclip.app');
  const [configLoading, setConfigLoading] = useState(true);
  const [busy, setBusy] = useState<'email' | 'google' | 'session' | null>(null);
  const [notice, setNotice] = useState<AuthNotice>(null);
  const syncing = useRef(false);
  const redirecting = useRef(false);

  const completeServerSignIn = useCallback(async (session: Session) => {
    if (syncing.current || redirecting.current) return;
    syncing.current = true;
    setBusy('session');
    setNotice({ kind: 'info', text: 'Finishing secure sign-in…' });
    try {
      const response = await fetch('/api/v1/auth/supabase', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.access_token}`,
        },
        body: '{}',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || result.code || 'Could not start your workspace session.');
      redirecting.current = true;
      setNotice({ kind: 'success', text: 'Signed in successfully. Opening your workspace…' });
      window.location.replace('/dashboard');
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not start your workspace session.' });
    } finally {
      syncing.current = false;
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    const savedRole = window.localStorage.getItem('pumpclips_signup_role');
    if (savedRole === 'streamer' || savedRole === 'clipper') setRole(savedRole);

    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'signup') setMode('signup');
    if (params.get('confirmed') === '1') {
      setNotice({ kind: 'success', text: 'Email confirmed. Your workspace is ready.' });
    }
    const authError = params.get('error');
    if (authError === 'google_not_configured') {
      setNotice({ kind: 'error', text: 'Google sign-in is not configured for this deployment.' });
    } else if (authError === 'oauth_failed' || authError === 'oauth_state') {
      setNotice({ kind: 'error', text: 'That sign-in attempt expired or could not be verified. Please try again.' });
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const initialize = async () => {
      try {
        const response = await fetch('/api/v1/auth/config', { cache: 'no-store' });
        const config = await response.json().catch(() => ({}));
        if (!response.ok || !config.url || !config.anonKey) {
          throw new Error(config.message || 'Authentication is not configured yet. Add the Supabase URL and anon key to the deployment environment.');
        }
        if (typeof config.appUrl === 'string' && config.appUrl) setAppUrl(config.appUrl);
        const client = createClient(config.url, config.anonKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        });
        if (cancelled) return;
        setSupabase(client);
        const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
          if (session) window.setTimeout(() => { void completeServerSignIn(session); }, 0);
        });
        unsubscribe = () => listener.subscription.unsubscribe();
        const { data } = await client.auth.getSession();
        if (data.session && !cancelled) await completeServerSignIn(data.session);
      } catch (error) {
        if (!cancelled) {
          setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Authentication setup is unavailable.' });
        }
      } finally {
        if (!cancelled) setConfigLoading(false);
      }
    };
    void initialize();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [completeServerSignIn]);

  const chooseRole = (value: 'streamer' | 'clipper') => {
    setRole(value);
    window.localStorage.setItem('pumpclips_signup_role', value);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    if (!supabase) {
      setNotice({ kind: 'error', text: 'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to the deployment environment.' });
      return;
    }
    setBusy('email');
    try {
      const normalizedEmail = email.trim();
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: `${appUrl}/auth?confirmed=1`,
            data: { role },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setNotice({ kind: 'success', text: 'Account created. Check your inbox for a confirmation email, then return here to sign in.' });
        } else {
          await completeServerSignIn(data.session);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
        if (error) throw error;
        if (!data.session) throw new Error('Supabase did not return a sign-in session. Please try again.');
        await completeServerSignIn(data.session);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed. Please try again.';
      setNotice({ kind: 'error', text: message });
    } finally {
      setBusy(null);
    }
  };

  const signInWithGoogle = async () => {
    setNotice(null);
    if (!supabase) {
      setNotice({ kind: 'error', text: 'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to the deployment environment.' });
      return;
    }
    setBusy('google');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${appUrl}/auth` },
      });
      if (error) throw error;
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Google sign-in failed. Please try again.' });
      setBusy(null);
    }
  };

  const switchMode = (next: 'signin' | 'signup') => {
    setMode(next);
    setNotice(null);
    setPassword('');
  };

  return (
    <main className="auth-page">
      <header className="auth-header">
        <a className="auth-brand" href="/"><img src="/logo.svg" alt=""/><span>pumpclips</span></a>
        <a className="auth-back" href="/">Back to home <span>↗</span></a>
      </header>
      <section className="auth-layout">
        <div className="auth-story">
          <span className="auth-kicker">PUMPCLIPS / CREATOR NETWORK</span>
          <h1>Make your<br/><em>next move.</em></h1>
          <p>One account for creators, clippers, campaigns, and rewards. Start with the workspace that keeps the work moving.</p>
          <div className="auth-proof"><span>01</span><p><strong>Source to signal.</strong><br/>Bring long-form video into a network built around the moment that matters.</p></div>
          <div className="auth-proof"><span>02</span><p><strong>Work with trust.</strong><br/>Clear briefs, visible profiles, and rewards that follow the work.</p></div>
        </div>
        <div className="auth-card">
          <div className="auth-tabs" role="group" aria-label="Authentication mode">
            <button type="button" aria-pressed={mode === 'signin'} className={mode === 'signin' ? 'active' : ''} onClick={() => switchMode('signin')}>Sign in</button>
            <button type="button" aria-pressed={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => switchMode('signup')}>Create account</button>
          </div>
          <div className="auth-card-heading">
            <span className="auth-kicker">{mode === 'signin' ? 'WELCOME BACK' : 'JOIN THE NETWORK'}</span>
            <h2>{mode === 'signin' ? 'Get back to the work.' : 'Build your account.'}</h2>
            <p>{mode === 'signin' ? 'Pick up your campaigns, cuts, and conversations.' : 'Create one secure account and choose your role as you go.'}</p>
          </div>
          {mode === 'signup' && <div className="role-picker" aria-label="Choose your role">
            <button type="button" className={role === 'clipper' ? 'selected' : ''} aria-pressed={role === 'clipper'} onClick={() => chooseRole('clipper')}><strong>Clipper</strong><span>Find moments, publish cuts, earn.</span></button>
            <button type="button" className={role === 'streamer' ? 'selected' : ''} aria-pressed={role === 'streamer'} onClick={() => chooseRole('streamer')}><strong>Streamer</strong><span>Launch a pump, grow your reach.</span></button>
          </div>}
          <form className="auth-email-form" onSubmit={submit}>
            <label>Email address<input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@studio.com" autoComplete="email" required disabled={!!busy}/></label>
            <label>Password<input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === 'signup' ? 'At least 8 characters' : 'Enter your password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={mode === 'signup' ? 8 : undefined} required disabled={!!busy}/></label>
            <button className="auth-secondary" type="submit" disabled={!!busy || configLoading || !supabase}>
              {busy === 'email' ? <><span className="auth-spinner" aria-hidden="true"/>{mode === 'signin' ? 'Signing in…' : 'Creating account…'}</> : busy === 'session' ? <><span className="auth-spinner" aria-hidden="true"/>Opening workspace…</> : mode === 'signin' ? 'Sign in with email' : 'Create account'}
            </button>
          </form>
          {configLoading && !notice && <p className="auth-notice auth-notice-info" role="status" aria-live="polite">Setting up secure sign-in…</p>}
          {notice && <p className={`auth-notice auth-notice-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'} aria-live="polite">{notice.text}</p>}
          <div className="auth-divider"><span>or</span></div>
          <div className="auth-actions">
            {process.env.NEXT_PUBLIC_PRIVY_APP_ID&&<PrivyWalletLogin/>}
            <button className="auth-primary" type="button" onClick={signInWithGoogle} disabled={!!busy || configLoading || !supabase}>
              {busy === 'google' ? <><span className="auth-spinner" aria-hidden="true"/>Connecting…</> : busy === 'session' ? <><span className="auth-spinner" aria-hidden="true"/>Opening workspace…</> : <>Continue with Google <span>↗</span></>}
            </button>
            <p className="auth-helper">Wallet sign-in is verified by Privy and PumpClip. Email and Google sign-in use secure Supabase sessions.</p>
          </div>
          <p className="auth-terms">By continuing, you agree to the pumpclips <a href="/">Terms</a> and <a href="/">Privacy</a>. No seed phrase is ever requested.</p>
        </div>
      </section>
    </main>
  );
}
