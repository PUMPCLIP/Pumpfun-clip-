function appOrigin() {
  const fallback = process.env.NODE_ENV === 'production' ? 'https://pumpclip.app' : 'http://localhost:3000';
  try {
    const parsed = new URL(process.env.APP_URL || fallback);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return fallback;
    return parsed.origin;
  } catch {
    return fallback;
  }
}

export const config = {
  appUrl: appOrigin(),
  cluster: process.env.SOLANA_CLUSTER || 'devnet',
  rpc: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  mint: process.env.PUMPCLIP_MINT || '',
  decimals: Number(process.env.PUMPCLIP_DECIMALS || 6),
  streamerMin: BigInt(process.env.STREAMER_MIN_RAW || '1'),
  clipperMin: BigInt(process.env.CLIPPER_MIN_RAW || '1'),
  streamerFee: BigInt(process.env.STREAMER_FEE_RAW || '1000000'),
  clipperFeeMin: BigInt(process.env.CLIPPER_FEE_MIN_RAW || '0'),
  clipperFeeMax: BigInt(process.env.CLIPPER_FEE_MAX_RAW || '1000000000'),
  tokenTreasury: process.env.TOKEN_TREASURY || '',
  solTreasury: process.env.SOL_TREASURY || '',
  minFunding: BigInt(process.env.MIN_FUNDING_LAMPORTS || '10000000'),
  moneyEnabled: process.env.SOLANA_CLUSTER === 'devnet' && !!process.env.PUMPCLIP_MINT && !!process.env.TOKEN_TREASURY && !!process.env.SOL_TREASURY
};

export function raw(value: unknown): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,18})$/.test(value)) throw new Error('INVALID_AMOUNT');
  return BigInt(value);
}
