'use client';

import dynamic from 'next/dynamic';
import {usePathname} from 'next/navigation';

const PrivyShell=dynamic(()=>import('./privy-shell'),{ssr:false});

export default function Providers({children}:{children:React.ReactNode}) {
  const appId=process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const pathname=usePathname();
  const needsAuth=pathname==='/auth'||pathname==='/dashboard'||pathname.startsWith('/studio');
  if(!appId||!needsAuth) return <>{children}</>;
  return <PrivyShell appId={appId}>{children}</PrivyShell>;
}
