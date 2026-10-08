'use client';
import {useEffect,useState} from 'react';
import bs58 from 'bs58';
import {availableWallets,WalletProvider} from '@/lib/browser-wallet';

type Props={
  currentWallet?:string;
  network?:string;
  csrf:string;
  onLinked:(address:string)=>void;
};

type ApiData={code?:string;message?:string;[key:string]:unknown};
async function requestJson<T extends ApiData>(path:string,init:RequestInit={}):Promise<T>{
  const response=await fetch(path,{...init,credentials:'same-origin',cache:'no-store'});
  const data=await response.json().catch(()=>({})) as T;
  if(!response.ok) throw new Error(data.message||data.code||'The wallet request could not be completed.');
  return data;
}
const shortAddress=(value:string)=>value.length>18?`${value.slice(0,8)}…${value.slice(-8)}`:value;

export default function WalletConnect({currentWallet,network='devnet',csrf,onLinked}:Props){
  const [wallets,setWallets]=useState<{name:string;provider:WalletProvider}[]>([]);
  const [selected,setSelected]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const refresh=()=>{
    const next=availableWallets();
    setWallets(next);
    setSelected(value=>value&&next.some(item=>item.provider.publicKey?.toBase58()===value)?value:next[0]?.provider.publicKey?.toBase58()||'');
  };
  useEffect(()=>{
    refresh();
    const timer=window.setInterval(refresh,1000);
    window.addEventListener('focus',refresh);
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[]);
  async function connectAndVerify(){
    setBusy(true);setError('');setNotice('Opening your Solana wallet…');
    try{
      const item=wallets.find(candidate=>candidate.provider.publicKey?.toBase58()===selected)||wallets[0];
      if(!item) throw new Error('Install Phantom, Solflare, or another Solana wallet, then open this page inside that wallet browser.');
      const connected=await item.provider.connect();
      const address=connected.publicKey.toBase58();
      setSelected(address);
      if(currentWallet===address){setNotice('This wallet is already linked to your account.');return;}
      const challenge=await requestJson<{id:string;message:string}>('/api/v1/wallet/challenge',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify({address}),
      });
      if(typeof item.provider.signMessage!=='function') throw new Error('This wallet does not support message signing. Try Phantom or Solflare.');
      setNotice('Approve the verification message in your wallet. No SOL will move.');
      const signed=await item.provider.signMessage(new TextEncoder().encode(challenge.message));
      await requestJson('/api/v1/wallet/verify',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify({challengeId:challenge.id,signature:bs58.encode(signed.signature)}),
      });
      setNotice(`Wallet linked: ${shortAddress(address)} · ${network}`);
      onLinked(address);
    }catch(caught){setError(caught instanceof Error?caught.message:'Could not connect this Solana wallet.');}
    finally{setBusy(false);}
  }
  return <div className="settings-wallet-connect">
    <div className="settings-wallet-connect-head"><div><p className="settings-eyebrow">WALLET CONNECTION</p><h3>{currentWallet?'Wallet linked':'Connect a Solana wallet'}</h3></div><span className="settings-network-badge">{network}</span></div>
    {currentWallet?<div className="settings-wallet-address"><span>Linked address</span><code>{currentWallet}</code></div>:<p className="settings-wallet-copy">Link Phantom, Solflare, Backpack, or another injected Solana wallet. You will approve a signed message only; this step never transfers funds.</p>}
    {wallets.length>1&&<div className="settings-wallet-choices" role="group" aria-label="Choose wallet">{wallets.map(item=>{const address=item.provider.publicKey?.toBase58()||'';return <button key={item.name+address} type="button" className={selected===address?'selected':''} onClick={()=>setSelected(address)}>{item.name}{address&&<small>{shortAddress(address)}</small>}</button>;})}</div>}
    <div className="settings-wallet-actions"><button className="settings-primary" type="button" onClick={()=>void connectAndVerify()} disabled={busy}>{busy?'Waiting for wallet…':currentWallet?'Link another wallet':'Connect wallet'}</button>{wallets.length===0&&<><a className="settings-secondary" href="https://phantom.app/download" target="_blank" rel="noreferrer">Get Phantom ↗</a><button className="settings-secondary" type="button" onClick={refresh}>Refresh wallets</button></>}</div>
    {notice&&<p className="settings-wallet-notice" role="status" aria-live="polite">{notice}</p>}
    {error&&<p className="settings-wallet-error" role="alert">{error}</p>}
  </div>;
}
