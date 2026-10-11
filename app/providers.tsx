'use client';

import dynamic from 'next/dynamic';
import {useEffect,useState} from 'react';
import {usePathname} from 'next/navigation';
import PrivyConfigContext from './privy-config-context';

const PrivyShell=dynamic(()=>import('./privy-shell'),{ssr:false});

export default function Providers({children}:{children:React.ReactNode}) {
  const [appId,setAppId]=useState<string|null>(()=>process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim()||null);
  const [configReady,setConfigReady]=useState(()=>Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID));
  const pathname=usePathname();
  const needsAuth=pathname==='/auth'||pathname==='/dashboard'||pathname.startsWith('/studio');

  useEffect(()=>{
    let cancelled=false;
    if(appId||!needsAuth){setConfigReady(true);return;}
    setConfigReady(false);
    void fetch('/api/v1/auth/privy-config',{cache:'no-store'})
      .then(async response=>{
        const payload=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error('Privy configuration is unavailable.');
        if(typeof payload.appId==='string'&&payload.appId.trim())setAppId(payload.appId.trim());
      })
      .catch(()=>{})
      .finally(()=>{if(!cancelled)setConfigReady(true);});
    return()=>{cancelled=true;};
  },[appId,needsAuth]);

  const content=appId&&needsAuth?<PrivyShell appId={appId}>{children}</PrivyShell>:children;
  return <PrivyConfigContext.Provider value={{appId,ready:configReady}}>{content}</PrivyConfigContext.Provider>;
}
