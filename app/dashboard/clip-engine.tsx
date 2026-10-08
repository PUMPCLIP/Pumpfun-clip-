'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import {PublicKey,SystemProgram,Transaction} from '@solana/web3.js';
import {walletFor} from '@/lib/browser-wallet';

type ClipJob = {
  id: string;
  status: 'queued' | 'processing' | 'succeeded' | 'failed';
  aspect_ratio: '9:16' | '1:1' | '16:9';
  start_seconds?: number | null;
  end_seconds?: number | null;
  output_asset_id?: string | null;
  preview_url?: string | null;
  download_url?: string | null;
  error_message?: string | null;
  created_at: string;
};

type ApiPayload<T> = T & { message?: string; code?: string };
type ClipPlan = {trial:{total:number;remaining:number};plan:{status:'active';name:string;monthlyClips:number;used:number;remaining:number;periodStart:string;periodEnd:string}|null;payment:{amountLamports:string;amountSol:string;destination:string;network:string}|null;wallet:string|null};

const csrf = () => decodeURIComponent(document.cookie.split('; ').find(cookie => cookie.startsWith('pc_csrf='))?.split('=')[1] || '');
const assetUrl = (id: string) => `/api/v1/assets/${encodeURIComponent(id)}`;
const timeLabel = (seconds?: number | null) => seconds == null ? '' : `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
const previewAspect = (ratio: ClipJob['aspect_ratio']) => ratio === '16:9' ? '16 / 9' : ratio === '1:1' ? '1 / 1' : '9 / 16';

async function readResponse<T>(response: Response): Promise<ApiPayload<T>> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.message || data.code || 'The request could not be completed.') as Error & { code?: string }; error.code = data.code; throw error; }
  return data as ApiPayload<T>;
}

export default function ClipEngine() {
  const [sourceMode, setSourceMode] = useState<'link' | 'upload'>('link');
  const [sourceUrl, setSourceUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [instructions, setInstructions] = useState('');
  const [caption, setCaption] = useState('');
  const [aspectRatio, setAspectRatio] = useState<ClipJob['aspect_ratio']>('9:16');
  const [captionStyle, setCaptionStyle] = useState<'classic' | 'bold' | 'signal'>('classic');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [authRequired, setAuthRequired] = useState(false);
  const [jobs, setJobs] = useState<ClipJob[]>([]);
  const [plan, setPlan] = useState<ClipPlan | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [paymentIntent, setPaymentIntent] = useState<{id:string;amountLamports:string;amountSol:string;destination:string;network:string;wallet:string}|null>(null);

  const refreshJobs = useCallback(async () => {
    try {
      const response = await fetch('/api/v1/ai/clips', { cache: 'no-store' });
      if (response.status === 401) {
        setAuthRequired(true);
        setJobs([]);
        return;
      }
      const data = await readResponse<{ items: ClipJob[] }>(response);
      setAuthRequired(false);
      setJobs(data.items || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load recent clips.');
    }
  }, []);

  const refreshPlan = useCallback(async () => {
    try {
      const response = await fetch('/api/v1/clip-plan', { cache: 'no-store' });
      if (response.status === 401) { setAuthRequired(true); return; }
      setPlan(await readResponse<ClipPlan>(response) as ClipPlan);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load your clip plan.'); }
  }, []);

  useEffect(() => {
    void refreshJobs();
    void refreshPlan();
    const timer = window.setInterval(() => { void refreshJobs(); }, 4000);
    return () => window.clearInterval(timer);
  }, [refreshJobs, refreshPlan]);

  const preparePlan = async () => {
    setPlanBusy(true); setError('');
    try {
      const intent = await readResponse<{id:string;amountLamports:string;amountSol:string;destination:string;network:string;wallet:string}>(await fetch('/api/v1/clip-plan', {
        method: 'POST', headers: {'content-type':'application/json','x-csrf-token':csrf(),'idempotency-key':crypto.randomUUID()}, body: '{}',
      }));
      setPaymentIntent(intent);
      setShowPlan(true);
      setNotice('Verify the recipient and network below before opening your wallet.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not prepare the clip plan payment.'); }
    finally { setPlanBusy(false); }
  };

  const payPlan = async () => {
    if(!paymentIntent)return;
    setPlanBusy(true); setError('');
    try {
      const provider = walletFor(paymentIntent.wallet);
      const connected = await provider.connect();
      if (connected.publicKey.toBase58() !== paymentIntent.wallet) throw new Error('Connect the Solana wallet linked to your Pumpclip account.');
      const transaction = new Transaction().add(SystemProgram.transfer({fromPubkey:connected.publicKey,toPubkey:new PublicKey(paymentIntent.destination),lamports:Number(paymentIntent.amountLamports)}));
      const sent = await provider.signAndSendTransaction(transaction);
      await readResponse(await fetch(`/api/v1/clip-plan/intents/${paymentIntent.id}/verify`, {
        method:'POST', headers:{'content-type':'application/json','x-csrf-token':csrf()}, body:JSON.stringify({signature:sent.signature}),
      }));
      setPaymentIntent(null); setShowPlan(false); setNotice('Payment verified. Your 20-clip monthly plan is active.'); await refreshPlan();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The clip plan payment could not be completed.'); }
    finally { setPlanBusy(false); }
  };

  useEffect(() => {
    const requestedSource = new URLSearchParams(window.location.search).get('sourceUrl');
    if (!requestedSource) return;
    try {
      const source = new URL(requestedSource);
      const host = source.hostname.toLowerCase().replace(/^www\./, '');
      const supported = ['youtube.com', 'youtu.be', 'tiktok.com', 'instagram.com', 'x.com', 'twitter.com', 'pump.fun'];
      if (source.protocol !== 'https:' || !supported.some(domain => host === domain || host.endsWith(`.${domain}`))) return;
      setSourceMode('link');
      setSourceUrl(source.toString());
    } catch {
      // Ignore invalid or unsupported source query parameters.
    }
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!rightsConfirmed) {
      setError('Confirm that you own this video or have permission to edit it.');
      return;
    }
    if (sourceMode === 'link' && !sourceUrl.trim()) {
      setError('Paste a supported HTTPS video link first.');
      return;
    }
    if (sourceMode === 'upload' && !file) {
      setError('Choose a video file to upload.');
      return;
    }
    if (sourceMode === 'upload' && file && file.size > 150_000_000) {
      setError('Choose a video smaller than 150 MB.');
      return;
    }
    if ((start && !end) || (!start && end)) {
      setError('Enter both an in point and an out point, or leave both blank.');
      return;
    }
    const startSeconds = start ? Number(start) : undefined;
    const endSeconds = end ? Number(end) : undefined;
    if (startSeconds !== undefined && endSeconds !== undefined && (endSeconds <= startSeconds || endSeconds - startSeconds > 180)) {
      setError('Choose a valid segment up to 180 seconds long.');
      return;
    }

    setBusy(true);
    try {
      let sourceAssetId: string | undefined;
      if (sourceMode === 'upload' && file) {
        const form = new FormData();
        form.set('file', file);
        form.set('kind', 'source');
        form.set('rightsDeclared', 'true');
        const uploaded = await readResponse<{ id: string }>(await fetch('/api/v1/uploads', {
          method: 'POST',
          headers: { 'x-csrf-token': csrf() },
          body: form,
        }));
        sourceAssetId = uploaded.id;
      }

      const payload = {
        ...(sourceAssetId ? { sourceAssetId } : { sourceUrl: sourceUrl.trim() }),
        rightsConfirmed,
        instructions: instructions.trim(),
        aspectRatio,
        caption: caption.trim(),
        captionStyle,
        ...(startSeconds !== undefined && endSeconds !== undefined ? { start: startSeconds, end: endSeconds } : {}),
      };
      const created = await readResponse<ClipJob>(await fetch('/api/v1/ai/clips', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf(),
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify(payload),
      }));
      setNotice('Clip queued. Processing status and the rendered preview will appear below.');
      setJobs(current => [created, ...current.filter(job => job.id !== created.id)].slice(0, 12));
      void refreshJobs();
    } catch (caught) {
      const code = (caught as {code?:string})?.code;
      if (code === 'CLIP_TRIAL_EXHAUSTED' || code === 'CLIP_PLAN_LIMIT_REACHED') setShowPlan(true);
      setError(caught instanceof Error ? caught.message : 'Could not queue this clip.');
    } finally {
      setBusy(false);
    }
  };

  return <section className="page-section clip-engine-page">
    <div className="page-heading clip-engine-heading">
      <div><p className="kicker">MEDIA LAB / NATIVE FFMPEG</p><h1>Make the moment travel.</h1><p>Upload footage or link a supported video, choose exact in/out points, then preview and download your render.</p></div>
      <span className="clip-engine-badge"><i/> WORKER READY</span>
    </div>

    {authRequired && <div className="clip-engine-signin" role="status"><strong>Sign in to use the clip engine.</strong><span>Your private uploads, render jobs, and results are tied to your account.</span><a href="/auth">Sign in or create an account ↗</a></div>}
    {error && <p className="clip-engine-error" role="alert">{error}</p>}
    {notice && <p className="clip-engine-notice" role="status" aria-live="polite">{notice}</p>}
    {!authRequired && plan && <><div className="clip-engine-plan panel" role="status"><div><span className="kicker">CLIP ACCESS</span><strong>{plan.plan ? `${plan.plan.remaining} of ${plan.plan.monthlyClips} monthly clips remaining` : `${plan.trial.remaining} of ${plan.trial.total} free clips remaining`}</strong><small>{plan.plan ? `Renews ${new Date(plan.plan.periodEnd).toLocaleDateString()}.` : plan.trial.remaining <= 1 ? 'You are running low. Upgrade before your free clips run out.' : 'Your first two clips are free.'}</small></div>{(!plan.plan && (showPlan || plan.trial.remaining <= 1)) && <button className="primary-action" type="button" onClick={() => void preparePlan()} disabled={planBusy || !plan.payment}>{planBusy ? 'Preparing upgrade…' : 'Upgrade · 20 clips · 2 SOL'}</button>}{plan.plan && <span className="clip-engine-plan-badge">MONTHLY PLAN</span>}</div>{paymentIntent&&<div className="clip-engine-payment panel" role="dialog" aria-labelledby="payment-title"><div><span className="kicker">SOLANA PAYMENT / VERIFY BEFORE APPROVAL</span><h2 id="payment-title">Unlock your monthly clip plan</h2><p>Review every detail below. PumpClip will only activate the plan after the confirmed on-chain transfer.</p></div><dl><div><dt>Amount</dt><dd>{paymentIntent.amountSol} SOL</dd></div><div><dt>Network</dt><dd>{paymentIntent.network}</dd></div><div><dt>Recipient</dt><dd><code>{paymentIntent.destination}</code></dd></div><div><dt>Wallet</dt><dd><code>{paymentIntent.wallet}</code></dd></div></dl><p className="clip-engine-payment-warning">This is an on-chain transfer and cannot be reversed. Verify the recipient, amount, network, and wallet fee in Phantom or Solflare before approving.</p><div className="clip-engine-payment-actions"><button className="primary-action" type="button" onClick={() => void payPlan()} disabled={planBusy}>{planBusy ? 'Waiting for wallet approval…' : 'Open wallet to approve 2 SOL'}</button><button className="text-button" type="button" onClick={() => {setPaymentIntent(null);setShowPlan(false);}}>Cancel</button></div></div>}</>}

    {!authRequired && <div className="clip-engine-layout">
      <form className="clip-engine-form panel" onSubmit={submit}>
        <div className="clip-engine-section-head"><div><span>01 / SOURCE</span><h2>Bring your footage.</h2></div><span className="clip-engine-private">PRIVATE BY DEFAULT</span></div>
        <div className="clip-engine-tabs" role="group" aria-label="Choose video source">
          <button type="button" className={sourceMode === 'link' ? 'selected' : ''} aria-pressed={sourceMode === 'link'} onClick={() => setSourceMode('link')}>Video link</button>
          <button type="button" className={sourceMode === 'upload' ? 'selected' : ''} aria-pressed={sourceMode === 'upload'} onClick={() => setSourceMode('upload')}>Upload file</button>
        </div>
        {sourceMode === 'link' ? <label className="clip-engine-field">Supported video URL<input type="url" value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=…" autoComplete="url"/><small>YouTube, TikTok, Instagram, X, and authorized Pump.fun campaign sources.</small></label> : <label className="clip-engine-field">Source video<input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={event => setFile(event.target.files?.[0] || null)}/><small>MP4, MOV, or WebM · maximum 150 MB</small></label>}
        <label className="clip-engine-rights"><input type="checkbox" checked={rightsConfirmed} onChange={event => setRightsConfirmed(event.target.checked)}/><span>I own this video or have permission to download, edit, and use it.</span></label>

        <div className="clip-engine-section-head clip-engine-edit-head"><div><span>02 / EDIT</span><h2>Set the cut.</h2></div></div>
        <div className="clip-engine-times"><label className="clip-engine-field">In point · seconds<input type="number" min="0" step="0.1" value={start} onChange={event => setStart(event.target.value)} placeholder="0"/></label><label className="clip-engine-field">Out point · seconds<input type="number" min="0.1" step="0.1" value={end} onChange={event => setEnd(event.target.value)} placeholder="30"/></label></div>
        <label className="clip-engine-field">Instructions / optional time range<textarea rows={3} maxLength={2000} value={instructions} onChange={event => setInstructions(event.target.value)} placeholder="Optional: 00:45–01:12, or a note for the editor."/><small>Without timestamps, the engine exports the first 30 seconds.</small></label>
        <div className="clip-engine-times"><label className="clip-engine-field">Export format<select value={aspectRatio} onChange={event => setAspectRatio(event.target.value as ClipJob['aspect_ratio'])}><option value="9:16">9:16 · vertical</option><option value="1:1">1:1 · square</option><option value="16:9">16:9 · landscape</option></select></label><label className="clip-engine-field">Caption style<select value={captionStyle} onChange={event => setCaptionStyle(event.target.value as typeof captionStyle)}><option value="classic">Classic white</option><option value="bold">Bold outline</option><option value="signal">Signal yellow</option></select></label></div>
        <label className="clip-engine-field">On-screen caption<input type="text" maxLength={200} value={caption} onChange={event => setCaption(event.target.value)} placeholder="Optional hook burned into the clip"/><small>{caption.length}/200 characters</small></label>
        <button className="primary-action clip-engine-submit" type="submit" disabled={busy || authRequired}>{busy ? <><span className="clip-engine-spinner"/>Uploading and queueing…</> : 'Generate clip ↗'}</button>
        <p className="clip-engine-disclaimer">Processing requires an eligible Clipper account and available credits. Link ingestion supports YouTube, TikTok, Instagram, and X.</p>
      </form>

      <aside className="clip-engine-side">
        <div className="clip-engine-guide panel"><span className="kicker">HOW IT WORKS</span><h2>From source to short.</h2><ol><li><b>01</b><span>Upload licensed footage or add a supported HTTPS video link.</span></li><li><b>02</b><span>Set exact timestamps, aspect ratio, and optional burned-in captions.</span></li><li><b>03</b><span>The worker renders an MP4; preview it here or download it.</span></li></ol><p>Every render is private to your account until you choose to submit or publish it.</p></div>
        <div className="clip-engine-guide-note"><strong>Precise cuts. No source changes.</strong><span>The original upload stays untouched. Rendered clips are saved as separate assets.</span></div>
      </aside>
    </div>}

    <section className="clip-engine-jobs" aria-labelledby="clip-jobs-title">
      <div className="clip-engine-jobs-head"><div><p className="kicker">YOUR WORK / RECENT EXPORTS</p><h2 id="clip-jobs-title">Recent clips</h2></div><button type="button" className="text-button" onClick={() => void refreshJobs()} disabled={authRequired}>Refresh ↻</button></div>
      {authRequired ? <p className="clip-engine-empty">Sign in to see your recent jobs.</p> : jobs.length === 0 ? <p className="clip-engine-empty">Your clip jobs will appear here after you submit a source.</p> : <div className="clip-engine-job-grid">{jobs.map(job => <article className="clip-engine-job" key={job.id}>
        <div className="clip-engine-job-head"><span className={'clip-engine-status '+job.status}><i/>{job.status}</span><small>{new Date(job.created_at).toLocaleString()}</small></div>
        {job.output_asset_id ? <video className="clip-engine-preview" style={{aspectRatio:previewAspect(job.aspect_ratio)}} src={job.preview_url || assetUrl(job.output_asset_id)} controls playsInline preload="metadata" aria-label={`${job.aspect_ratio} rendered video preview`}/> : <div className="clip-engine-preview-placeholder" style={{aspectRatio:previewAspect(job.aspect_ratio)}}>{job.status === 'failed' ? 'Render needs attention' : 'Rendering your clip…'}</div>}
        <div className="clip-engine-job-meta"><strong>{job.aspect_ratio} export</strong>{job.start_seconds != null && job.end_seconds != null && <span>{timeLabel(job.start_seconds)}–{timeLabel(job.end_seconds)}</span>}</div>
        {job.error_message && <p className="clip-engine-job-error" role="alert">{job.error_message}</p>}
        {job.output_asset_id && <a className="clip-engine-download" href={job.download_url || `${assetUrl(job.output_asset_id)}?download=1`} download={`pumpclip-${job.aspect_ratio.replace(':', 'x')}.mp4`}>Download MP4 ↓</a>}
      </article>)}</div>}
    </section>
  </section>;
}
