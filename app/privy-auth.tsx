'use client';

import {useEffect} from 'react';
import {getIdentityToken,usePrivy} from '@privy-io/react-auth';

export default function PrivySessionBridge({children}:{children:React.ReactNode}) {
  const {ready,authenticated,getAccessToken,logout}=usePrivy();
  useEffect(()=>{
    if(!ready||!authenticated) return;
    let active=true;
    (async()=>{
      try {
        const token=await getAccessToken();
        if(!token) return;
        const identityToken=await getIdentityToken();
        const response=await fetch('/api/v1/auth/privy',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({accessToken:token,identityToken})});
        if(response.ok){
          const selectedRole=window.localStorage.getItem('pumpclips_signup_role');
          if(selectedRole==='streamer'||selectedRole==='clipper'){
            await fetch('/api/v1/me/roles',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({roles:[selectedRole]})});
            window.localStorage.removeItem('pumpclips_signup_role');
          }
        } else if(active) console.error('Privy session sync failed',await response.text());
      } catch(error) { if(active) console.error('Privy session sync failed',error); }
    })();
    return()=>{active=false;};
  },[ready,authenticated,getAccessToken]);
  useEffect(()=>{
    if(!ready||authenticated) return;
    if(document.cookie.includes('pc_session=')) fetch('/api/v1/auth/logout',{method:'POST',credentials:'same-origin'}).catch(()=>undefined);
  },[ready,authenticated]);
  return <>{children}</>;
}
