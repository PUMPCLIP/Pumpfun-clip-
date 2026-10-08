'use client';

import {createContext,useCallback,useContext,useEffect,useMemo,useState} from 'react';
import {getIdentityToken,usePrivy} from '@privy-io/react-auth';

export const PRIVY_SESSION_SYNC_REQUEST_KEY='pumpclips_privy_session_sync_requested';
type SessionSyncState={status:'idle'|'syncing'|'ready'|'error';wallet?:string;error?:string};
type SessionSyncContext=SessionSyncState&{retry:()=>void};
const emptyState:SessionSyncContext={status:'idle',retry:()=>undefined};
const PrivyServerSessionContext=createContext<SessionSyncContext>(emptyState);

export function usePrivyServerSession(){return useContext(PrivyServerSessionContext);}

function readCsrfCookie(){
  const value=document.cookie.split('; ').find(cookie=>cookie.startsWith('pc_csrf='))?.split('=').slice(1).join('=')||'';
  try{return decodeURIComponent(value);}catch{return value;}
}

export default function PrivySessionBridge({children}:{children:React.ReactNode}) {
  const {ready,authenticated,getAccessToken}=usePrivy();
  const [state,setState]=useState<SessionSyncState>({status:'idle'});
  const [attempt,setAttempt]=useState(0);
  const retry=useCallback(()=>setAttempt(value=>value+1),[]);

  useEffect(()=>{
    if(!ready)return;
    if(!authenticated){setState({status:'idle'});return;}
    if(window.localStorage.getItem(PRIVY_SESSION_SYNC_REQUEST_KEY)!=='1'){
      setState({status:'idle'});
      return;
    }
    let active=true;
    setState({status:'syncing'});
    void (async()=>{
      const token=await getAccessToken();
      if(!token)throw new Error('Privy did not return an access token.');
      const identityToken=await getIdentityToken();
      const response=await fetch('/api/v1/auth/privy',{
        method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},
        body:JSON.stringify({accessToken:token,identityToken}),
      });
      const result=await response.json().catch(()=>({})) as {wallet?:unknown;message?:string;code?:string};
      if(!response.ok)throw new Error(result.message||result.code||'Could not start your PumpClip session.');

      const role=window.localStorage.getItem('pumpclips_signup_role');
      if(role==='streamer'||role==='clipper'){
        const csrf=readCsrfCookie();
        if(!csrf)throw new Error('The secure session token is missing. Please retry sign-in.');
        const roleResponse=await fetch('/api/v1/me/roles',{
          method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-csrf-token':csrf},
          body:JSON.stringify({roles:[role]}),
        });
        const roleResult=await roleResponse.json().catch(()=>({})) as {message?:string;code?:string};
        if(!roleResponse.ok)throw new Error(roleResult.message||roleResult.code||'Could not save your selected account role.');
        window.localStorage.removeItem('pumpclips_signup_role');
      }

      if(!active)return;
      window.localStorage.removeItem(PRIVY_SESSION_SYNC_REQUEST_KEY);
      setState({status:'ready',wallet:typeof result.wallet==='string'?result.wallet:undefined});
    })().catch(error=>{
      if(active)setState({status:'error',error:error instanceof Error?error.message:'Could not start your PumpClip session.'});
    });
    return()=>{active=false;};
  },[ready,authenticated,getAccessToken,attempt]);

  const value=useMemo(()=>({...state,retry}),[state,retry]);
  return <PrivyServerSessionContext.Provider value={value}>{children}</PrivyServerSessionContext.Provider>;
}
