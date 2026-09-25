import fs from 'node:fs';
import {PublicKey} from '@solana/web3.js';
export function rawTokens(value,decimals){const pattern=decimals?'^(0|[1-9][0-9]*)(\\.[0-9]{1,'+decimals+'})?$':'^(0|[1-9][0-9]*)$';if(typeof value!=='string'||!new RegExp(pattern).test(value))throw Error('Invalid token amount: '+String(value));const [whole,frac='']=value.split('.');return BigInt(whole)*10n**BigInt(decimals)+BigInt(frac.padEnd(decimals,'0')||'0');}
export function readPolicy(file){if(!file)throw Error('Specify --policy PATH to an approved token policy JSON');const policy=JSON.parse(fs.readFileSync(file,'utf8'));if(policy.network!=='devnet')throw Error('Only devnet policy is supported');if(!Number.isInteger(policy.decimals)||policy.decimals<0||policy.decimals>9)throw Error('Invalid decimals');
 for(const key of ['mintAuthorityAddress','tokenTreasuryAddress','solTreasuryAddress'])new PublicKey(policy[key]);
 if(typeof policy.distributionApprovedBy!=='string'||policy.distributionApprovedBy.trim().length<3)throw Error('Record who approved the distribution');
 if(policy.rewardModel!=='fixed-sol-after-manual-review')throw Error('Unsupported reward model');
 const amount={};for(const key of ['maximumSupplyTokens','streamerMinimumTokens','clipperMinimumTokens','streamerFeeTokens','clipperFeeMinimumTokens','clipperFeeMaximumTokens'])amount[key]=rawTokens(policy[key],policy.decimals);
 if(amount.maximumSupplyTokens<=0n||amount.streamerMinimumTokens<=0n||amount.clipperMinimumTokens<=0n||amount.streamerFeeTokens<=0n||amount.clipperFeeMaximumTokens<amount.clipperFeeMinimumTokens)throw Error('Token limits and fees must be consistent');
 return {policy,amount};
}
