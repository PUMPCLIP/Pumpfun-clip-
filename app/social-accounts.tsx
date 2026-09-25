'use client';
import {useEffect,useState} from 'react';
type Connected={provider:string;display_name?:string;updated_at:string};
const csrf=()=>decodeURIComponent(document.cookie.split('; ').find(c=>c.startsWith('pc_csrf='))?.split('=')[1]||'');
export default function SocialAccounts(){
 const [accounts,setAccounts]=useState<Connected[]>([]),[error,setError]=useState(''),[message,setMessage]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{fetch('/api/v1/social/connections').then(async r=>{if(!r.ok)throw Error('Could not load connected accounts');setAccounts(await r.json());}).catch(e=>setError(e.message)).finally(()=>setLoading(false));},[]);
 async function disconnect(provider:string){if(!window.confirm('Disconnect '+provider+' from PUMPCLIP? Existing posts will remain on the platform.'))return;
  setError('');setMessage('');try{const r=await fetch('/api/v1/social/connections/'+provider,{method:'DELETE',headers:{'x-csrf-token':csrf()}});const data=await r.json();if(!r.ok)throw Error(data.message||'Disconnect failed');setAccounts(old=>old.filter(a=>a.provider!==provider));setMessage('Disconnected '+provider+'. Revoke PUMPCLIP in '+provider+' account settings to remove its existing provider grant.');}catch(e){setError(e instanceof Error?e.message:'Disconnect failed');}
 }
 return <section className="social-accounts" aria-label="Connected social accounts"><div className="eyebrow">ACCOUNT SETTINGS</div><h2>Your publishing accounts</h2><p>Control which accounts PUMPCLIP can use. Disconnecting removes our stored token; posts already made remain on the platform.</p>{loading?<p>Loading connections…</p>:accounts.length?<ul>{accounts.map(a=><li key={a.provider}><span><strong>{a.provider==='x'?'X':a.provider[0].toUpperCase()+a.provider.slice(1)}</strong>{a.display_name&&' · '+a.display_name}</span><button className="outline" onClick={()=>disconnect(a.provider)}>Disconnect</button></li>)}</ul>:<p>No social accounts connected.</p>}{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}</section>;
}
