'use client';

import {useEffect,useState} from 'react';

type Destination={id:string;provider:string;address:string;label:string;is_default:boolean};
const csrf=()=>decodeURIComponent(document.cookie.split('; ').find(c=>c.startsWith('pc_csrf='))?.split('=')[1]||'');
const providers=['phantom','solflare','backpack','axiom','privy_embedded','manual'] as const;
const pretty=(value:string)=>value==='privy_embedded'?'Privy embedded wallet':value[0].toUpperCase()+value.slice(1);

export default function PayoutDestinations(){
  const [items,setItems]=useState<Destination[]>([]),[provider,setProvider]=useState('phantom'),[address,setAddress]=useState(''),[label,setLabel]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const load=()=>fetch('/api/v1/payout-destinations').then(r=>r.json()).then(setItems).catch(()=>setError('Payout destinations are unavailable until the database is migrated.'));
  useEffect(()=>{load();},[]);
  async function add(){setBusy(true);setError('');try{const r=await fetch('/api/v1/payout-destinations',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf()},body:JSON.stringify({provider,address,label})});const data=await r.json();if(!r.ok)throw Error(data.message||'Could not save payout destination');setItems(data);setAddress('');setLabel('');}catch(e){setError(e instanceof Error?e.message:'Could not save payout destination');}finally{setBusy(false);}}
  async function remove(id:string){const r=await fetch('/api/v1/payout-destinations/'+id,{method:'DELETE',headers:{'x-csrf-token':csrf()}});if(r.ok)setItems(await r.json());}
  return <section className="payout-destinations" aria-label="Payout destinations"><div className="eyebrow">PAYOUT RAILS / SOLANA</div><h2>Where rewards should land</h2><p>Link more than one Solana destination. Phantom, Solflare, Backpack, Axiom and Privy embedded wallets all settle through the same verified Solana rail; PUMPCLIP never asks for a seed phrase.</p><div className="payout-form"><select value={provider} onChange={e=>setProvider(e.target.value)}>{providers.map(x=><option key={x} value={x}>{pretty(x)}</option>)}</select><input value={address} onChange={e=>setAddress(e.target.value)} placeholder="Solana wallet address" aria-label="Solana wallet address"/><input value={label} onChange={e=>setLabel(e.target.value)} placeholder="Label (optional)" aria-label="Payout label"/><button className="primary" disabled={busy||!address} onClick={add}>{busy?'Saving…':'Add destination'}</button></div>{error&&<p role="alert">{error}</p>}<ul>{items.map(item=><li key={item.id}><span><strong>{pretty(item.provider)}</strong>{item.label&&' · '+item.label} {item.is_default&&<em>Default</em>}<small>{item.address.slice(0,6)}…{item.address.slice(-6)}</small></span><button className="outline" onClick={()=>remove(item.id)}>Remove</button></li>)}</ul></section>;
}
