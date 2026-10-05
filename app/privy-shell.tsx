'use client';

import {PrivyProvider} from '@privy-io/react-auth';
import PrivySessionBridge from './privy-auth';

export default function PrivyShell({children, appId}:{children:React.ReactNode;appId:string}) {
  return <PrivyProvider appId={appId} config={{
    loginMethods:['email','google','twitter','wallet'],
    appearance:{theme:'dark',accentColor:'#a8e063',logo:'/pumpclips-mark.jpg'},
    embeddedWallets:{solana:{createOnLogin:'users-without-wallets'}},
  }}><PrivySessionBridge>{children}</PrivySessionBridge></PrivyProvider>;
}
