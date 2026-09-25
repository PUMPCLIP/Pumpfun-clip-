import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Keypair} from '@solana/web3.js';
import {rawTokens,readPolicy} from '../lib/token-policy.mjs';
test('token policy rejects placeholders and invalid limits before issuance',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'pumpclip-policy-')),file=path.join(dir,'policy.json');
 try{
  const address=Keypair.generate().publicKey.toBase58();
  const policy={network:'devnet',decimals:6,maximumSupplyTokens:'1000',mintAuthorityAddress:address,tokenTreasuryAddress:address,solTreasuryAddress:address,streamerMinimumTokens:'1',clipperMinimumTokens:'1',streamerFeeTokens:'2',clipperFeeMinimumTokens:'0',clipperFeeMaximumTokens:'10',rewardModel:'fixed-sol-after-manual-review',distributionApprovedBy:'Founder review'};
  writeFileSync(file,JSON.stringify(policy));assert.equal(readPolicy(file).amount.maximumSupplyTokens,1000000000n);
  assert.equal(rawTokens('1.25',6),1250000n);
  assert.throws(()=>rawTokens('1.0000001',6));
  policy.maximumSupplyTokens='';writeFileSync(file,JSON.stringify(policy));assert.throws(()=>readPolicy(file));
  policy.maximumSupplyTokens='1000';policy.distributionApprovedBy='';writeFileSync(file,JSON.stringify(policy));assert.throws(()=>readPolicy(file));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
