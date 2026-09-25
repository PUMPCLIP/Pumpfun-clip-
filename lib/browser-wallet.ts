import {PublicKey,Transaction} from '@solana/web3.js';

export type WalletProvider={
  publicKey?:PublicKey;
  isPhantom?:boolean;
  isSolflare?:boolean;
  connect:()=>Promise<{publicKey:PublicKey}>;
  signMessage:(message:Uint8Array)=>Promise<{signature:Uint8Array}>;
  signAndSendTransaction:(tx:Transaction)=>Promise<{signature:string}>;
};
type WalletWindow=Window & {solana?:WalletProvider & {providers?:WalletProvider[]};phantom?:{solana?:WalletProvider};solflare?:WalletProvider};
export function availableWallets():{name:string;provider:WalletProvider}[] {
  if(typeof window==='undefined') return [];
  const w=window as WalletWindow;
  const candidates:[string,WalletProvider|undefined][]=[['Phantom',w.phantom?.solana],['Solflare',w.solflare],
    ...((w.solana?.providers||[]).map(p=>[p.isPhantom?'Phantom':p.isSolflare?'Solflare':'Solana wallet',p] as [string,WalletProvider])),
    ['Solana wallet',w.solana]];
  const seen=new Set<WalletProvider>();
  return candidates.filter((entry):entry is [string,WalletProvider]=>!!entry[1] && !seen.has(entry[1]) && !!seen.add(entry[1])).map(([name,provider])=>({name,provider}));
}
export function walletFor(address?:string,preferred?:string):WalletProvider {
  const wallets=availableWallets();
  const selected=wallets.find(w=>w.provider.publicKey?.toBase58()===address) || wallets.find(w=>w.name===preferred) || wallets[0];
  if(!selected) throw new Error('Install Phantom, Solflare, or another Solana wallet, then refresh. Pump.fun is a token launch platform, not a wallet; connect the wallet you use with Pump.fun.');
  return selected.provider;
}
