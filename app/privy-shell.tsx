'use client';

import {PrivyProvider} from '@privy-io/react-auth';
import {toSolanaWalletConnectors} from '@privy-io/react-auth/solana';
import PrivySessionBridge from './privy-auth';

const solanaConnectors=toSolanaWalletConnectors({shouldAutoConnect:false});

export default function PrivyShell({children, appId}:{children:React.ReactNode;appId:string}) {
  return <PrivyProvider appId={appId} config={{
    loginMethods:['email','google','twitter','tiktok','twitch','wallet'],
    loginMethodsAndOrder:{primary:['email','google','twitter','tiktok'],overflow:['twitch']},
    appearance:{theme:'dark',accentColor:'#a8e063',logo:'/logo.svg',showWalletLoginFirst:true,walletChainType:'solana-only',walletList:['phantom','jupiter','detected_solana_wallets']},
    externalWallets:{solana:{connectors:solanaConnectors}},
    embeddedWallets:{solana:{createOnLogin:'users-without-wallets'}},
  }}><PrivySessionBridge>{children}</PrivySessionBridge></PrivyProvider>;
}
