'use client';

import {Component,useCallback,useEffect,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import {useConnectWallet,useLoginWithSiws,usePrivy} from '@privy-io/react-auth';
import type {BaseConnectedSolanaWallet,BaseConnectedWalletType} from '@privy-io/react-auth';
import {useWallets as useSolanaWallets} from '@privy-io/react-auth/solana';
import bs58 from 'bs58';
import {PRIVY_SESSION_SYNC_REQUEST_KEY,usePrivyServerSession} from './privy-auth';
import DirectWalletLogin,{performDirectWalletLogin,type WalletProvider} from './direct-wallet-login';
import {usePrivyConfig} from './privy-config-context';

type ApiData={code?:string;message?:string;[key:string]:unknown};
const walletProviders:{id:WalletProvider;name:string;icon:string}[]=[
  {id:'phantom',name:'Phantom',icon:'/auth-icons/phantom.svg'},
  {id:'jupiter',name:'Jupiter',icon:'/auth-icons/jupiter.svg'},
];

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

function shortAddress(value:string){return value.length>16?`${value.slice(0,7)}…${value.slice(-5)}`:value;}
function toBase64(bytes:Uint8Array){let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return window.btoa(binary);}

function PumpBrandBadge(){
  return <div className="auth-provider-brand-badge" aria-label="Pump.fun ecosystem brand">
    <img className="auth-provider-icon auth-pump-icon" src="/auth-icons/pumpfun-mark.svg" alt=""/>
    <span className="auth-provider-title">Pump.fun</span>
  </div>;
}

class PrivyWalletErrorBoundary extends Component<{children:ReactNode;fallback:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?this.props.fallback:this.props.children;}
}

export function AuthProviderOptions({googleButton}:{googleButton:ReactNode}){
  const {appId,ready}=usePrivyConfig();
  if(appId)return <PrivyWalletErrorBoundary fallback={<DirectWalletLogin googleButton={googleButton} initialMessage="Privy wallet access is unavailable in this browser. Connect an installed Solana wallet below."/>}><PrivyWalletLogin googleButton={googleButton}/></PrivyWalletErrorBoundary>;
  return <DirectWalletLogin googleButton={googleButton} initialMessage={!ready?'Checking secure wallet setup. You can still use an installed Solana wallet while it loads.':''}/>;
}

export default function PrivyWalletLogin({googleButton}:{googleButton:ReactNode}){
  const {ready,authenticated,linkWallet}=usePrivy();
  const {generateSiwsMessage,loginWithSiws}=useLoginWithSiws();
  const {status:sessionStatus,wallet:sessionWallet,error:sessionError,retry}=usePrivyServerSession();
  const {ready:walletsReady,wallets}=useSolanaWallets();
  const [selectedAddress,setSelectedAddress]=useState('');
  const [walletBusy,setWalletBusy]=useState<WalletProvider|null>(null);
  const [directMode,setDirectMode]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const pendingProviderRef=useRef<WalletProvider|null>(null);
  const pendingLinkWalletRef=useRef<BaseConnectedSolanaWallet|null>(null);
  const linkRunningRef=useRef(false);

  useEffect(()=>{
    setSelectedAddress(current=>{
      if(sessionWallet&&wallets.some(wallet=>wallet.address===sessionWallet))return sessionWallet;
      if(wallets.some(wallet=>wallet.address===current))return current;
      return wallets[0]?.address||'';
    });
  },[sessionWallet,wallets]);

  const verifyAndContinue=useCallback(async(walletOverride?:BaseConnectedSolanaWallet)=>{
    const wallet=walletOverride?.provider||wallets.find(item=>item.address===selectedAddress);
    const walletAddress=walletOverride?.address||wallet?.address;
    if(!wallet||!walletAddress){setError('Choose a connected Solana wallet first.');return;}
    setWalletBusy(null);setError('');setNotice('Requesting a non-transaction wallet verification message…');
    try{
      const account=await requestJson<{wallet?:string;csrf?:string}>('/api/v1/me');
      if(!account.csrf)throw new Error('The secure session token is missing. Please refresh and retry.');
      if(account.wallet===walletAddress){
        setNotice('This wallet is already linked. Opening your workspace…');
        window.location.replace('/dashboard');
        return;
      }
      const challenge=await requestJson<{id:string;message:string}>('/api/v1/wallet/challenge',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':account.csrf},
        body:JSON.stringify({address:walletAddress}),
      });
      setNotice('Approve the PumpClip verification message in your wallet. No funds will move.');
      const signed=await wallet.signMessage({message:new TextEncoder().encode(challenge.message)});
      await requestJson('/api/v1/wallet/verify',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':account.csrf},
        body:JSON.stringify({challengeId:challenge.id,signature:bs58.encode(signed.signature)}),
      });
      setNotice('Wallet verified and linked. Opening your workspace…');
      window.location.replace('/dashboard');
    }catch(caught){setError(caught instanceof Error?caught.message:'Could not verify this wallet. Please try again.');}
    finally{setWalletBusy(null);}
  },[selectedAddress,wallets]);

  const handleWalletConnected=useCallback(async(wallet:BaseConnectedWalletType)=>{
    const provider=pendingProviderRef.current;
    if(!provider)return;
    pendingProviderRef.current=null;
    setError('');setNotice('');
    try{
      if(wallet.type!=='solana')throw new Error('Choose a Solana wallet to continue.');
      if(authenticated){
        pendingLinkWalletRef.current=wallet;
        if(sessionStatus==='ready'){
          pendingLinkWalletRef.current=null;
          await verifyAndContinue(wallet);
          return;
        }
        window.localStorage.setItem(PRIVY_SESSION_SYNC_REQUEST_KEY,'1');
        setNotice('Preparing your secure PumpClip session before wallet verification…');
        retry();
        return;
      }

      setNotice('Sign a secure wallet login message. No transaction or payment is requested.');
      const message=await generateSiwsMessage({address:wallet.address});
      const signed=await wallet.provider.signMessage({message:new TextEncoder().encode(message)});
      pendingLinkWalletRef.current=wallet;
      window.localStorage.setItem(PRIVY_SESSION_SYNC_REQUEST_KEY,'1');
      await loginWithSiws({
        message,
        signature:toBase64(signed.signature),
        walletClientType:wallet.walletClientType,
        connectorType:wallet.connectorType,
      });
      setNotice('Wallet sign-in succeeded. Preparing your PumpClip session…');
    }catch(caught){
      pendingLinkWalletRef.current=null;
      window.localStorage.removeItem(PRIVY_SESSION_SYNC_REQUEST_KEY);
      setError(caught instanceof Error?caught.message:'Wallet sign-in could not be completed. Please try again.');
    }finally{setWalletBusy(null);}
  },[authenticated,generateSiwsMessage,loginWithSiws,retry,sessionStatus,verifyAndContinue]);

  const {connectWallet}=useConnectWallet({
    onSuccess:({wallet})=>{void handleWalletConnected(wallet);},
    onError:(caught)=>{
      pendingProviderRef.current=null;
      if(!authenticated)window.localStorage.removeItem(PRIVY_SESSION_SYNC_REQUEST_KEY);
      setWalletBusy(null);
      const details=caught&&typeof caught==='object'?caught as {code?:unknown;message?:unknown}:{};
      const cancelled=details.code===4001||String(details.code||'')==='4001'||/reject|cancel/i.test(typeof details.message==='string'?details.message:'');
      if(cancelled){setError('Wallet connection was cancelled. Nothing was signed; you can try again.');return;}
      if(!authenticated){setDirectMode(true);setError('');return;}
      setError('Wallet connection could not be opened. Please retry the wallet link.');
    },
  });

  useEffect(()=>{
    if(!authenticated||sessionStatus!=='ready'||!pendingLinkWalletRef.current||linkRunningRef.current)return;
    const wallet=pendingLinkWalletRef.current;
    pendingLinkWalletRef.current=null;
    linkRunningRef.current=true;
    void verifyAndContinue(wallet).finally(()=>{linkRunningRef.current=false;});
  },[authenticated,sessionStatus,verifyAndContinue]);

  function startWalletConnect(provider:WalletProvider){
    if(walletBusy)return;
    if(!ready){
      if(authenticated){setError('Your secure session is ready, but the wallet connector is still initializing. Please retry in a moment.');return;}
      setError('');setWalletBusy(provider);
      void performDirectWalletLogin(provider,{onNotice:setNotice,onError:setError}).finally(()=>setWalletBusy(null));
      return;
    }
    setError('');setNotice('');setWalletBusy(provider);pendingProviderRef.current=provider;
    if(!authenticated)window.localStorage.setItem(PRIVY_SESSION_SYNC_REQUEST_KEY,'1');
    const name=walletProviders.find(item=>item.id===provider)?.name||'Solana';
    try{
      connectWallet({
        walletList:[provider],
        walletChainType:'solana-only',
        preSelectedWalletId:provider,
        description:`Connect your ${name} wallet to PumpClip. You will only be asked to sign a message; no transaction is required.`,
      });
    }catch(caught){
      pendingProviderRef.current=null;
      if(!authenticated)window.localStorage.removeItem(PRIVY_SESSION_SYNC_REQUEST_KEY);
      if(!authenticated){
        void performDirectWalletLogin(provider,{onNotice:setNotice,onError:setError}).finally(()=>setWalletBusy(null));
        return;
      }
      setWalletBusy(null);setError(caught instanceof Error?caught.message:'Could not open the wallet connection. Please try again.');
    }
  }

  function continueExistingPrivySession(){
    window.localStorage.setItem(PRIVY_SESSION_SYNC_REQUEST_KEY,'1');
    setError('');setNotice('Preparing your secure PumpClip session…');retry();
  }

  const walletButtons=walletProviders.map(provider=><button
    key={provider.id}
    className="auth-provider-button"
    type="button"
    aria-label={`Continue with ${provider.name} wallet`}
    onClick={()=>startWalletConnect(provider.id)}
    disabled={!!walletBusy||(authenticated&&sessionStatus==='syncing')}
  >
    <img className="auth-provider-icon" src={provider.icon} alt=""/>
    <span className="auth-provider-title">{provider.name}</span>
    {walletBusy===provider.id&&<span className="auth-spinner" aria-hidden="true"/>}
  </button>);

  if(directMode)return <DirectWalletLogin googleButton={googleButton} initialMessage="Privy could not open the wallet connection. Use an installed wallet below to continue."/>;

  return <>
    <div className="auth-provider-grid">
      {walletButtons}
      {googleButton}
      <PumpBrandBadge/>
    </div>
    <div className="auth-wallet-state">
      {authenticated&&sessionStatus==='idle'&&<button className="auth-secondary" type="button" onClick={continueExistingPrivySession}>Continue with saved Privy session</button>}
      {authenticated&&sessionStatus==='syncing'&&<p className="auth-notice auth-notice-info" role="status" aria-live="polite">Finishing your secure PumpClip sign-in…</p>}
      {authenticated&&sessionStatus==='error'&&<>
        <p className="auth-notice auth-notice-error" role="alert">{sessionError||'Could not create your PumpClip session.'}</p>
        <button className="auth-secondary" type="button" onClick={continueExistingPrivySession}>Retry secure sign-in</button>
      </>}
      {authenticated&&sessionStatus==='ready'&&!walletsReady&&<p className="auth-notice auth-notice-info" role="status">Loading your Solana wallet…</p>}
      {authenticated&&sessionStatus==='ready'&&walletsReady&&wallets.length===0&&<>
        <p className="auth-notice auth-notice-info" role="status">Link a Solana wallet to prove ownership and finish setting up your account.</p>
        <button className="auth-secondary" type="button" onClick={()=>linkWallet({walletChainType:'solana-only'})}>Connect a Solana wallet</button>
      </>}
      {authenticated&&sessionStatus==='ready'&&walletsReady&&wallets.length>0&&<>
        <p className="auth-helper">Choose the Solana wallet to link. You’ll approve a domain-bound message only—no transaction or payment.</p>
        {wallets.length===1?<p className="auth-notice auth-notice-info">Connected wallet: <strong>{shortAddress(wallets[0].address)}</strong></p>:<div className="role-picker" aria-label="Choose a Solana wallet">
          {wallets.map(wallet=><button key={wallet.address} type="button" className={selectedAddress===wallet.address?'selected':''} aria-pressed={selectedAddress===wallet.address} onClick={()=>setSelectedAddress(wallet.address)}>
            <strong>{shortAddress(wallet.address)}</strong><span>Solana wallet</span>
          </button>)}
        </div>}
        <button className="auth-secondary" type="button" onClick={()=>void verifyAndContinue()} disabled={!!walletBusy||!selectedAddress}>
          {walletBusy?<><span className="auth-spinner" aria-hidden="true"/>Verifying wallet…</>:'Verify wallet & open workspace'}
        </button>
      </>}
      {error&&<p className="auth-notice auth-notice-error" role="alert" aria-live="polite">{error}</p>}
      {notice&&<p className="auth-notice auth-notice-info" role="status" aria-live="polite">{notice}</p>}
    </div>
  </>;
}
