import {readPolicy} from '../lib/token-policy.mjs';
const file=process.argv[2];const {policy,amount}=readPolicy(file);
console.log(JSON.stringify({network:policy.network,decimals:policy.decimals,maximumSupplyRaw:String(amount.maximumSupplyTokens),mintAuthorityAddress:policy.mintAuthorityAddress,tokenTreasuryAddress:policy.tokenTreasuryAddress,solTreasuryAddress:policy.solTreasuryAddress,rewardModel:policy.rewardModel,distributionApprovedBy:policy.distributionApprovedBy}));
