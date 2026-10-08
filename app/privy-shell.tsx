'use client';

import {PrivyProvider} from '@privy-io/react-auth';
import PrivySessionBridge from './privy-auth';

export default function PrivyShell({children, appId}:{children:React.ReactNode;appId:string}) {
  return <PrivyProvider appId={appId} config={{
    loginMethods:['email','google','twitter','tiktok','twitch','wallet'],
    loginMethodsAndOrder:{primary:['email','google','twitter','tiktok'],overflow:['twitch']},
    appearance:{theme:'dark',accentColor:'#a8e063',logo:'/logo.svg',showWalletLoginFirst:true},
    embeddedWallets:{solana:{createOnLogin:'users-without-wallets'}},
  }}><PrivySessionBridge>{children}</PrivySessionBridge></PrivyProvider>;
}
