'use client';

import {useState,type ReactNode} from 'react';
import bs58 from 'bs58';

export type WalletProvider='phantom'|'jupiter';
type InjectedSolanaProvider={
  isPhantom?:boolean;
  isJupiter?:boolean;
  name?:string;
  walletName?:string;
  providers?:InjectedSolanaProvider[];
  publicKey?:unknown;
  connect?:()=>Promise<{publicKey?:unknown}|void>;
  signMessage?:(message:Uint8Array)=>Promise<{signature:Uint8Array}>;
};
type WalletApiData={code?:string;message?:string;[key:string]:unknown};
type LoginCallbacks={onNotice:(message:string)=>void;onError:(message:string)=>void};
const providers:{id:WalletProvider;name:string;icon:string}[]=[
  {id:'phantom',name:'Phantom',icon:'/auth-icons/phantom.svg'},
  {id:'jupiter',name:'Jupiter',icon:'/auth-icons/jupiter.svg'},
];

function findInjectedProvider(id:WalletProvider):InjectedSolanaProvider|null{
  const scope=window as unknown as {
    solana?:InjectedSolanaProvider;
    phantom?:{solana?:InjectedSolanaProvider};
    jupiter?:{solana?:InjectedSolanaProvider;wallet?:InjectedSolanaProvider};
  };
  const roots=[scope.phantom?.solana,scope.jupiter?.solana,scope.jupiter?.wallet,scope.solana].filter((item):item is InjectedSolanaProvider=>Boolean(item));
  const candidates=roots.flatMap(item=>[item,...(item.providers||[])]);
  const unique=[...new Set(candidates)];
  const named=unique.find(item=>{
    const name=`${item.name||''} ${item.walletName||''}`.toLowerCase();
    return id==='phantom'
      ?item.isPhantom===true||item===scope.phantom?.solana||name.includes('phantom')
      :item.isJupiter===true||item===scope.jupiter?.solana||item===scope.jupiter?.wallet||name.includes('jupiter');
  });
  if(named)return named;
  // Some Solana extensions expose only window.solana.connect/signMessage. Use that
  // single unlabelled provider as a last-resort Solana fallback, never as Jupiter.
  if(id==='phantom'&&scope.solana&&!scope.solana.providers?.length&&!scope.solana.isJupiter){
    const name=`${scope.solana.name||''} ${scope.solana.walletName||''}`.toLowerCase();
    if(!name.includes('jupiter'))return scope.solana;
  }
  return null;
}

function publicKeyString(value:unknown):string{
  if(typeof value==='string')return value;
  if(!value||typeof value!=='object')return '';
  const key=value as {toBase58?:()=>string;toString?:()=>string};
  try{
    if(typeof key.toBase58==='function')return key.toBase58();
    if(typeof key.toString==='function'){
      const text=key.toString();
      return text==='[object Object]'?'':text;
    }
  }catch{return '';}
  return '';
}

async function postJson<T extends WalletApiData>(path:string,payload:object):Promise<T>{
  const response=await fetch(path,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  const data=await response.json().catch(()=>({})) as T;
  if(!response.ok)throw new Error(data.message||data.code||'Wallet sign-in could not be completed.');
  return data;
}

function wasCancelled(error:unknown){
  if(!error||typeof error!=='object')return false;
  const value=error as {code?:unknown;message?:unknown};
  return value.code===4001||String(value.code||'')==='4001'||/reject|cancel/i.test(typeof value.message==='string'?value.message:'');
}

export async function performDirectWalletLogin(id:WalletProvider,callbacks:LoginCallbacks){
  try{
    const provider=findInjectedProvider(id);
    const name=provider?.name||providers.find(item=>item.id===id)?.name||'Solana';
    if(!provider||!provider.connect){
      throw new Error(id==='phantom'
        ?'No Phantom or injected Solana wallet was detected. Install a wallet extension or open PumpClip inside your wallet browser, then retry.'
        :'No Jupiter wallet provider was detected. Try Phantom, or use a browser where Jupiter Wallet is available.');
    }
    if(!provider.signMessage)throw new Error(`${name} does not support secure message signing in this browser.`);
    callbacks.onNotice(`Connect ${name} and review a PumpClip sign-in message. If this wallet is new, a wallet-only account will be created. No transaction or payment is requested.`);
    const connected=await provider.connect();
    const walletAddress=publicKeyString(connected?.publicKey)||publicKeyString(provider.publicKey);
    if(!walletAddress)throw new Error(`${name} connected without returning a Solana public key. Please retry.`);
    const challenge=await postJson<{id:string;message:string}>('/api/v1/auth/wallet/challenge',{address:walletAddress,provider:id});
    callbacks.onNotice('Approve the domain-bound PumpClip sign-in message in your wallet. No transaction or payment is requested.');
    const signed=await provider.signMessage(new TextEncoder().encode(challenge.message));
    if(!(signed?.signature instanceof Uint8Array)||signed.signature.length===0)throw new Error(`${name} did not return a valid message signature.`);
    await postJson('/api/v1/auth/wallet/verify',{challengeId:challenge.id,signature:bs58.encode(signed.signature),provider:id});
    callbacks.onNotice('Wallet sign-in succeeded. Opening your workspace…');
    window.location.replace('/dashboard');
  }catch(caught){
    callbacks.onNotice('');
    callbacks.onError(wasCancelled(caught)
      ?'Wallet sign-in was cancelled. Nothing was signed or submitted; you can try again.'
      :caught instanceof Error?caught.message:'Wallet sign-in could not be completed. Please try again.');
  }
}

export default function DirectWalletLogin({googleButton,initialMessage=''}:{googleButton:ReactNode;initialMessage?:string}){
  const [busy,setBusy]=useState<WalletProvider|null>(null);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const visibleNotice=notice||(!busy?initialMessage:'');

  async function signIn(id:WalletProvider){
    if(busy)return;
    setBusy(id);setError('');setNotice('');
    await performDirectWalletLogin(id,{onNotice:setNotice,onError:setError});
    setBusy(null);
  }

  return <>
    <div className="auth-provider-grid">
      {providers.map(provider=><button key={provider.id} className="auth-provider-button" type="button" aria-label={`Continue with ${provider.name} wallet`} onClick={()=>void signIn(provider.id)} disabled={!!busy}>
        <img className="auth-provider-icon" src={provider.icon} alt=""/>
        <span className="auth-provider-title">{provider.name}</span>
        {busy===provider.id&&<span className="auth-spinner" aria-hidden="true"/>}
      </button>)}
      {googleButton}
      <div className="auth-provider-brand-badge" aria-label="Pump.fun ecosystem brand">
        <img className="auth-provider-icon auth-pump-icon" src="/auth-icons/pumpfun-mark.svg" alt=""/>
        <span className="auth-provider-title">Pump.fun</span>
      </div>
    </div>
    {(visibleNotice||error)&&<p className={`auth-notice ${error?'auth-notice-error':'auth-notice-info'}`} role={error?'alert':'status'} aria-live="polite">{error||visibleNotice}</p>}
  </>;
}
