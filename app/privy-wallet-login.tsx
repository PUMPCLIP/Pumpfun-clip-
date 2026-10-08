'use client';

import {useEffect,useState} from 'react';
import {useLogin,usePrivy} from '@privy-io/react-auth';
import {useSignMessage as useSolanaSignMessage,useWallets as useSolanaWallets} from '@privy-io/react-auth/solana';
import bs58 from 'bs58';
import {PRIVY_SESSION_SYNC_REQUEST_KEY,usePrivyServerSession} from './privy-auth';

type ApiData={code?:string;message?:string;[key:string]:unknown};
async function requestJson<T extends ApiData>(path:string,init:RequestInit={}):Promise<T>{
  const response=await fetch(path,{...init,credentials:'same-origin',cache:'no-store'});
  const data=await response.json().catch(()=>({})) as T;
  if(!response.ok){
    if(data.code==='WALLET_ALREADY_LINKED')throw new Error('That wallet is already linked to another PumpClip account.');
    if(data.code==='INVALID_SIGNATURE')throw new Error('The wallet signature was not accepted. Please request a fresh verification message and try again.');
    throw new Error(data.message||data.code||'The request could not be completed.');
  }
  return data;
}
const shortAddress=(value:string)=>value.length>16?`${value.slice(0,7)}…${value.slice(-5)}`:value;

export default function PrivyWalletLogin(){
  const {ready,authenticated,linkWallet}=usePrivy();
  const {login}=useLogin({
    onComplete:()=>{setError('');setNotice('Privy authentication succeeded. Preparing your PumpClip session…');},
    onError:()=>{window.localStorage.removeItem(PRIVY_SESSION_SYNC_REQUEST_KEY);setBusy(false);setError('Wallet sign-in was cancelled or could not be completed. Please try again.');},
  });
  const {status:sessionStatus,wallet:sessionWallet,error:sessionError,retry}=usePrivyServerSession();
  const {ready:walletsReady,wallets}=useSolanaWallets();
  const {signMessage}=useSolanaSignMessage();
  const [selectedAddress,setSelectedAddress]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  useEffect(()=>{
    setSelectedAddress(current=>{
      if(sessionWallet&&wallets.some(wallet=>wallet.address===sessionWallet))return sessionWallet;
      if(wallets.some(wallet=>wallet.address===current))return current;
      return wallets[0]?.address||'';
    });
  },[sessionWallet,wallets]);

  function startPrivyFlow(){
    setError('');setNotice('Connect with a Solana wallet in Privy. PumpClip will next request a signed message, not a transaction.');
    window.localStorage.setItem(PRIVY_SESSION_SYNC_REQUEST_KEY,'1');
    if(authenticated){retry();return;}
    login({loginMethods:['wallet'],walletChainType:'solana-only'});
  }

  async function verifyAndContinue(){
    const wallet=wallets.find(item=>item.address===selectedAddress);
    if(!wallet){setError('Choose a connected Solana wallet first.');return;}
    setBusy(true);setError('');setNotice('Requesting a non-transaction wallet verification message…');
    try{
      const account=await requestJson<{wallet?:string;csrf?:string}>('/api/v1/me');
      if(!account.csrf)throw new Error('The secure session token is missing. Please refresh and retry.');
      if(account.wallet===wallet.address){
        setNotice('This wallet is already linked. Opening your workspace…');
        window.location.replace('/dashboard');
        return;
      }
      const challenge=await requestJson<{id:string;message:string}>('/api/v1/wallet/challenge',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':account.csrf},
        body:JSON.stringify({address:wallet.address}),
      });
      setNotice('Approve the PumpClip verification message in your wallet. No funds will move.');
      const signed=await signMessage({wallet,message:new TextEncoder().encode(challenge.message)});
      await requestJson('/api/v1/wallet/verify',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':account.csrf},
        body:JSON.stringify({challengeId:challenge.id,signature:bs58.encode(signed.signature)}),
      });
      setNotice('Wallet verified and linked. Opening your workspace…');
      window.location.replace('/dashboard');
    }catch(caught){setError(caught instanceof Error?caught.message:'Could not verify this wallet. Please try again.');}
    finally{setBusy(false);}
  }

  return <div className="privy-wallet-auth">
    {!authenticated?<button className="auth-primary" type="button" onClick={startPrivyFlow} disabled={!ready}>
      {ready?<>Continue with Solana wallet <span>↗</span></>:'Loading secure wallet sign-in…'}
    </button>:<>
      {sessionStatus==='idle'&&<>
        <p className="auth-notice auth-notice-info" role="status">Your Privy wallet is connected. Continue to create a PumpClip session.</p>
        <button className="auth-primary" type="button" onClick={startPrivyFlow}>Continue with this Privy wallet <span>↗</span></button>
      </>}
      {sessionStatus==='syncing'&&<p className="auth-notice auth-notice-info" role="status" aria-live="polite">Finishing your secure PumpClip sign-in…</p>}
      {sessionStatus==='error'&&<>
        <p className="auth-notice auth-notice-error" role="alert">{sessionError||'Could not create your PumpClip session.'}</p>
        <button className="auth-secondary" type="button" onClick={startPrivyFlow}>Retry secure sign-in</button>
      </>}
      {sessionStatus==='ready'&&!walletsReady&&<p className="auth-notice auth-notice-info" role="status">Loading your Solana wallet…</p>}
      {sessionStatus==='ready'&&walletsReady&&wallets.length===0&&<>
        <p className="auth-notice auth-notice-info" role="status">Link a Solana wallet to prove ownership and finish setting up your account.</p>
        <button className="auth-secondary" type="button" onClick={()=>linkWallet({walletChainType:'solana-only'})}>Connect a Solana wallet</button>
      </>}
      {sessionStatus==='ready'&&walletsReady&&wallets.length>0&&<>
        <p className="auth-helper">Choose the Solana wallet to link. You’ll approve a domain-bound message only—no transaction or payment.</p>
        {wallets.length===1?<p className="auth-notice auth-notice-info">Connected wallet: <strong>{shortAddress(wallets[0].address)}</strong></p>:<div className="role-picker" aria-label="Choose a Solana wallet">
          {wallets.map(wallet=><button key={wallet.address} type="button" className={selectedAddress===wallet.address?'selected':''} aria-pressed={selectedAddress===wallet.address} onClick={()=>setSelectedAddress(wallet.address)}>
            <strong>{shortAddress(wallet.address)}</strong><span>Solana wallet</span>
          </button>)}
        </div>}
        <button className="auth-primary" type="button" onClick={()=>void verifyAndContinue()} disabled={busy||!selectedAddress}>
          {busy?<><span className="auth-spinner" aria-hidden="true"/>Verifying wallet…</>:'Verify wallet & open workspace'}
        </button>
      </>}
    </>}
    {error&&sessionStatus!=='error'&&<p className="auth-notice auth-notice-error" role="alert">{error}</p>}
    {notice&&<p className="auth-notice auth-notice-info" role="status" aria-live="polite">{notice}</p>}
  </div>;
}
