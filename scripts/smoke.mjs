const origin=process.env.APP_URL;if(!origin?.startsWith('https://'))throw new Error('Set APP_URL to the staging HTTPS origin');
async function check(path,expected){const r=await fetch(origin+path,{signal:AbortSignal.timeout(15000),redirect:'manual'});if(r.status!==expected)throw new Error(path+' returned '+r.status+', expected '+expected);console.log(path+' '+r.status);return r;}
await check('/api/health',200);
const campaigns=await check('/api/v1/campaigns',200);const data=await campaigns.json();if(!Array.isArray(data.items))throw new Error('Campaign response invalid');
await check('/api/v1/me',401);
console.log('Public staging smoke checks passed. Account, wallet, posting and payouts still require a consenting live-account test.');
