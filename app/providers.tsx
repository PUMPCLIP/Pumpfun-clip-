'use client';

import {PrivyProvider} from '@privy-io/react-auth';
import PrivySessionBridge from './privy-auth';

export default function Providers({children}:{children:React.ReactNode}) {
  const appId=process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if(!appId) return <>{children}</>;
  return <PrivyProvider appId={appId} config={{
    loginMethods:['email','google','twitter','wallet'],
    appearance:{theme:'dark',accentColor:'#a8e063',logo:'/icon.svg'},
    embeddedWallets:{solana:{createOnLogin:'users-without-wallets'}},
  }}><PrivySessionBridge>{children}</PrivySessionBridge></PrivyProvider>;
}
