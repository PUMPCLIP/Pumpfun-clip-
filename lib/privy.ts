import {verifyAccessToken} from '@privy-io/node';
import {ApiError} from './auth';

export type PrivyIdentity={userId:string};

export async function verifyPrivyToken(token:string):Promise<PrivyIdentity> {
  const appId=process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const verificationKey=process.env.PRIVY_VERIFICATION_KEY;
  if(!appId||!verificationKey) throw new ApiError('PRIVY_NOT_CONFIGURED',503);
  try {
    const result=await verifyAccessToken({access_token:token,app_id:appId,verification_key:verificationKey});
    return {userId:result.user_id};
  } catch { throw new ApiError('INVALID_PRIVY_TOKEN',401); }
}
