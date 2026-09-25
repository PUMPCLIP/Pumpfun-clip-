import {cookies} from 'next/headers';
import {z} from 'zod';
import {db,one,tx,audit} from '@/lib/db';
import {ApiError,hash,random,requireUser,mutation,revokeSession,jsonError} from '@/lib/auth';
import {config,raw} from '@/lib/config';
import {address,balance,verifyWalletSignature,verifyTokenTransfer,verifySolTransfer,assertDevnet} from '@/lib/chain';
import {gate} from '@/lib/access';
export const runtime='nodejs';
type Context={params:Promise<{path:string[]}>};
const uuid=z.string().uuid();
const idempotency=(r:Request)=>{const k=r.headers.get('idempotency-key'); if(!k || k.length>128) throw new ApiError('IDEMPOTENCY_KEY_REQUIRED'); return k;};
async function body(request:Request,schema:z.ZodType) {const value=schema.safeParse(await request.json().catch(()=>null)); if(!value.success) throw new ApiError('INVALID_INPUT',400,value.error.issues.map(i=>i.message).join('; ')); return value.data as Record<string,any>;}
async function requireMoney() {if(!config.moneyEnabled) throw new ApiError('DEVNET_MONEY_CONFIG_REQUIRED',503);await assertDevnet();}
async function campaignOwner(id:string,user:string) {
  const c=await one<any>('SELECT * FROM campaigns WHERE id=$1',[id]);
  if(!c) throw new ApiError('NOT_FOUND',404);
  if(c.streamer_id!==user) throw new ApiError('FORBIDDEN',403);
  return c;
}
const reply=(data:unknown,status=200)=>Response.json(data,{status});
async function handle(request:Request,path:string[],method:string):Promise<Response> {
  const p=path;
  if(method==='GET' && p.join('/')==='campaigns') {
    const cursor=new URL(request.url).searchParams.get('cursor');
    const rows=await db.query('SELECT c.*,u.display_name AS streamer_name FROM campaigns c JOIN users u ON u.id=c.streamer_id WHERE c.state=$1 AND ($2::timestamptz IS NULL OR c.created_at<$2) ORDER BY c.created_at DESC LIMIT 21',['live',cursor]);
    return reply({items:rows.rows.slice(0,20),nextCursor:rows.rows.length>20?rows.rows[19].created_at:null});
  }
  if(method==='GET' && p[0]==='campaigns' && p[1] && p.length===2) {
    const c=await one<any>('SELECT c.*,u.display_name AS streamer_name FROM campaigns c JOIN users u ON u.id=c.streamer_id WHERE c.id=$1',[p[1]]);
    if(!c || c.state!=='live') throw new ApiError('NOT_FOUND',404);
    return reply(c);
  }
  const user=method==='GET'?await requireUser():await mutation(request);
  if(method==='GET' && p.join('/')==='me') {
    const wallet=await one<{address:string}>('SELECT address FROM wallets WHERE user_id=$1',[user.user_id]);
    let access:{status:string,balanceRaw?:string,slot?:number}={status:wallet?'unconfigured':'wallet_required'};
    if(wallet && config.mint) {
      try {const b=await balance(wallet.address);
        const minimum=user.roles.includes('streamer') && user.roles.includes('clipper')
          ? (config.streamerMin>config.clipperMin?config.streamerMin:config.clipperMin)
          : user.roles.includes('streamer')?config.streamerMin:config.clipperMin;
        access={status:BigInt(b.raw)>=minimum?'eligible':'insufficient',balanceRaw:b.raw,slot:b.slot};
      }
      catch {access={status:'rpc_unavailable'};}
    }
    return reply({id:user.user_id,email:user.email,name:user.display_name,roles:user.roles,wallet:wallet?.address,access,
      config:{network:config.cluster,mint:config.mint,decimals:config.decimals,streamerMinRaw:String(config.streamerMin),clipperMinRaw:String(config.clipperMin),
        streamerFeeRaw:String(config.streamerFee),tokenTreasury:config.tokenTreasury,solTreasury:config.solTreasury,moneyEnabled:config.moneyEnabled},
      csrf:(await cookies()).get('pc_csrf')?.value});
  }
  if(method==='POST' && p.join('/')==='auth/logout') {await revokeSession(); return reply({ok:true});}
  if(method==='POST' && p.join('/')==='me/roles') {
    const data=await body(request,z.object({roles:z.array(z.enum(['streamer','clipper'])).min(1).max(2)}));
    await db.query('UPDATE users SET roles=$2,updated_at=now() WHERE id=$1',[user.user_id,[...new Set(data.roles)]]);
    await audit(db,user.user_id,'roles.updated','user',user.user_id,{roles:data.roles}); return reply({roles:data.roles});
  }
  if(method==='POST' && p.join('/')==='wallet/challenge') {
    const data=await body(request,z.object({address:z.string().min(32).max(50)}));
    address(data.address);
    const nonce=random(), message=`PUMPCLIP wallet link\nDomain: ${new URL(config.appUrl).host}\nNetwork: ${config.cluster}\nAccount: ${user.user_id}\nWallet: ${data.address}\nNonce: ${nonce}\nExpires: ${new Date(Date.now()+300000).toISOString()}`;
    const row=await one<{id:string}>('INSERT INTO wallet_challenges(user_id,address,nonce_hash,message,expires_at) VALUES($1,$2,$3,$4,now()+interval \'5 minutes\') RETURNING id',[user.user_id,data.address,hash(nonce),message]);
    return reply({id:row!.id,message,expiresInSeconds:300});
  }
  if(method==='POST' && p.join('/')==='wallet/verify') {
    const data=await body(request,z.object({challengeId:uuid,signature:z.string().min(40)}));
    const challenge=await one<any>('SELECT * FROM wallet_challenges WHERE id=$1 AND user_id=$2 AND used_at IS NULL AND expires_at>now()',[data.challengeId,user.user_id]);
    if(!challenge || !verifyWalletSignature(challenge.message,data.signature,challenge.address)) throw new ApiError('INVALID_SIGNATURE',422);
    try {
      await tx(async c=>{
        const used=await one<any>('UPDATE wallet_challenges SET used_at=now() WHERE id=$1 AND used_at IS NULL RETURNING id',[challenge.id],c);
        if(!used) throw new ApiError('CHALLENGE_USED',409);
        await c.query('INSERT INTO wallets(user_id,address,network) VALUES($1,$2,$3)',[user.user_id,challenge.address,config.cluster]);
        await audit(c,user.user_id,'wallet.linked','wallet',used.id,{address:challenge.address});
      });
    } catch(e:any) {if(e.code==='23505') throw new ApiError('WALLET_ALREADY_LINKED',409); throw e;}
    return reply({ok:true,address:challenge.address});
  }
  if(method==='GET' && p.join('/')==='sessions') {
    const rows=await db.query('SELECT id,created_at,expires_at FROM sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>now() ORDER BY created_at DESC',[user.user_id]);
    return reply(rows.rows);
  }
  if(method==='POST' && p[0]==='sessions' && p[2]==='revoke') {
    await db.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND id=$2',[user.user_id,p[1]]); return reply({ok:true});
  }
  if(method==='GET' && p.join('/')==='me/campaigns') {
    const rows=await db.query('SELECT * FROM campaigns WHERE streamer_id=$1 ORDER BY created_at DESC',[user.user_id]); return reply(rows.rows);
  }
  if(method==='GET' && p.join('/')==='me/joined') {
    const rows=await db.query('SELECT c.* FROM campaign_memberships m JOIN campaigns c ON c.id=m.campaign_id WHERE m.clipper_id=$1 ORDER BY m.created_at DESC',[user.user_id]); return reply(rows.rows);
  }
  if(method==='POST' && p.join('/')==='campaigns') {
    await gate(user.user_id,'streamer');
    const data=await body(request,z.object({title:z.string().min(5).max(120),description:z.string().max(5000).default('')}));
    const c=await one<any>('INSERT INTO campaigns(streamer_id,title,description) VALUES($1,$2,$3) RETURNING *',[user.user_id,data.title,data.description]);
    await db.query('INSERT INTO escrow_accounts(campaign_id) VALUES($1)',[c.id]);
    await audit(db,user.user_id,'campaign.created','campaign',c.id); return reply(c,201);
  }
  if(p[0]==='campaigns' && p[1] && method==='PATCH' && p.length===2) {
    await gate(user.user_id,'streamer'); const c=await campaignOwner(p[1],user.user_id);
    if(c.state!=='draft') throw new ApiError('CAMPAIGN_LOCKED',409);
    const data=await body(request,z.object({title:z.string().min(5).max(120).optional(),description:z.string().max(5000).optional(),
      licenseTerms:z.string().min(10).max(5000).optional(),sourceAssetId:uuid.optional(),
      targetPlatforms:z.array(z.enum(['tiktok','youtube','instagram','x'])).optional(),
      fixedRewardLamports:z.string().regex(/^[0-9]+$/).optional(),entryFeeRaw:z.string().regex(/^[0-9]+$/).optional()}));
    if(data.sourceAssetId) {
      const asset=await one('SELECT id FROM media_assets WHERE id=$1 AND owner_id=$2 AND status=$3 AND rights_declared_at IS NOT NULL',[data.sourceAssetId,user.user_id,'verified']);
      if(!asset) throw new ApiError('SOURCE_RIGHTS_REQUIRED',422);
    }
    if(data.entryFeeRaw!==undefined && (raw(data.entryFeeRaw)<config.clipperFeeMin || raw(data.entryFeeRaw)>config.clipperFeeMax)) throw new ApiError('FEE_OUT_OF_RANGE',422);
    if(data.fixedRewardLamports!==undefined) raw(data.fixedRewardLamports);
    const updated=await one<any>(`UPDATE campaigns SET title=COALESCE($2,title),description=COALESCE($3,description),
      license_terms=COALESCE($4,license_terms),source_asset_id=COALESCE($5,source_asset_id),
      target_platforms=COALESCE($6,target_platforms),fixed_reward_lamports=COALESCE($7,fixed_reward_lamports),
      entry_fee_raw=COALESCE($8,entry_fee_raw),updated_at=now() WHERE id=$1 RETURNING *`,
      [p[1],data.title,data.description,data.licenseTerms,data.sourceAssetId,data.targetPlatforms,data.fixedRewardLamports,data.entryFeeRaw]);
    await audit(db,user.user_id,'campaign.updated','campaign',p[1]); return reply(updated);
  }
  if(method==='POST' && p.join('/')==='fees/intents') {
    await requireMoney(); idempotency(request);
    const data=await body(request,z.object({campaignId:uuid,purpose:z.enum(['creation','entry'])}));
    const campaign=await one<any>('SELECT * FROM campaigns WHERE id=$1',[data.campaignId]); if(!campaign) throw new ApiError('NOT_FOUND',404);
    if(data.purpose==='creation') {
      if(campaign.streamer_id!==user.user_id || !['draft','fee_pending'].includes(campaign.state)) throw new ApiError('FORBIDDEN',403);
      await gate(user.user_id,'streamer');
    } else {
      if(campaign.state!=='live' || campaign.streamer_id===user.user_id) throw new ApiError('CAMPAIGN_NOT_JOINABLE',409);
      await gate(user.user_id,'clipper');
    }
    const amount=data.purpose==='creation'?config.streamerFee:BigInt(campaign.entry_fee_raw);
    const intent=await one<any>(`INSERT INTO fee_intents(user_id,campaign_id,purpose,mint,amount_raw,treasury,idempotency_key)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id,campaign_id,purpose) DO UPDATE SET id=fee_intents.id RETURNING *`,
      [user.user_id,data.campaignId,data.purpose,config.mint,String(amount),config.tokenTreasury,idempotency(request)]);
    if(data.purpose==='creation') await db.query("UPDATE campaigns SET state='fee_pending' WHERE id=$1 AND state='draft'",[data.campaignId]);
    return reply(intent,201);
  }
  if(method==='POST' && p[0]==='fees' && p[2]==='verify') {
    await requireMoney(); idempotency(request);
    const data=await body(request,z.object({signature:z.string().min(60).max(120)}));
    const intent=await one<any>('SELECT * FROM fee_intents WHERE id=$1 AND user_id=$2',[p[1],user.user_id]);
    if(!intent) throw new ApiError('NOT_FOUND',404);
    if(intent.state==='verified') return reply(intent);
    const wallet=await gate(user.user_id,intent.purpose==='creation'?'streamer':'clipper');
    await verifyTokenTransfer(data.signature,wallet.address,intent.treasury,intent.mint,BigInt(intent.amount_raw));
    try {
      return reply(await tx(async c=>{
        const updated=await one<any>("UPDATE fee_intents SET state='verified',signature=$2,updated_at=now() WHERE id=$1 AND state='pending' RETURNING *",[intent.id,data.signature],c);
        if(!updated) return one('SELECT * FROM fee_intents WHERE id=$1',[intent.id],c);
        if(intent.purpose==='creation') await c.query("UPDATE campaigns SET state='funding_pending',updated_at=now() WHERE id=$1 AND state='fee_pending'",[intent.campaign_id]);
        await audit(c,user.user_id,'fee.verified','fee_intent',intent.id,{signature:data.signature}); return updated;
      }));
    } catch(e:any) {if(e.code==='23505') throw new ApiError('DUPLICATE_SIGNATURE',409); throw e;}
  }
  if(method==='POST' && p[0]==='campaigns' && p[2]==='funding-intents') {
    await requireMoney(); idempotency(request);
    const c=await campaignOwner(p[1],user.user_id); if(c.state!=='funding_pending') throw new ApiError('FEE_REQUIRED',409);
    await gate(user.user_id,'streamer');
    const data=await body(request,z.object({lamports:z.string().regex(/^[0-9]+$/)}));
    if(raw(data.lamports)<config.minFunding) throw new ApiError('FUNDING_TOO_LOW',422);
    const intent=await one<any>(`INSERT INTO funding_intents(campaign_id,user_id,expected_lamports,destination,idempotency_key) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(user_id,idempotency_key) DO UPDATE SET id=funding_intents.id RETURNING *`,
      [p[1],user.user_id,data.lamports,config.solTreasury,idempotency(request)]);
    if(intent.campaign_id!==p[1] || String(intent.expected_lamports)!==data.lamports) throw new ApiError('IDEMPOTENCY_CONFLICT',409);
    return reply(intent,201);
  }
  if(method==='POST' && p[0]==='funding-intents' && p[2]==='verify') {
    await requireMoney(); idempotency(request);
    const data=await body(request,z.object({signature:z.string().min(60).max(120)}));
    const intent=await one<any>('SELECT * FROM funding_intents WHERE id=$1 AND user_id=$2',[p[1],user.user_id]); if(!intent) throw new ApiError('NOT_FOUND',404);
    if(intent.state==='verified') return reply(intent);
    const wallet=await gate(user.user_id,'streamer');
    await verifySolTransfer(data.signature,wallet.address,intent.destination,BigInt(intent.expected_lamports));
    try {
      return reply(await tx(async c=>{
        const updated=await one<any>("UPDATE funding_intents SET state='verified',signature=$2,updated_at=now() WHERE id=$1 AND state='pending' RETURNING *",[intent.id,data.signature],c);
        if(!updated) return one('SELECT * FROM funding_intents WHERE id=$1',[intent.id],c);
        await c.query('UPDATE escrow_accounts SET funded_lamports=funded_lamports+$2,updated_at=now() WHERE campaign_id=$1',[intent.campaign_id,intent.expected_lamports]);
        await c.query("UPDATE campaigns SET state='funded',updated_at=now() WHERE id=$1 AND state='funding_pending'",[intent.campaign_id]);
        await audit(c,user.user_id,'funding.verified','funding_intent',intent.id,{signature:data.signature}); return updated;
      }));
    } catch(e:any) {if(e.code==='23505') throw new ApiError('DUPLICATE_SIGNATURE',409); throw e;}
  }
  if(method==='POST' && p[0]==='campaigns' && p[2]==='publish') {
    await gate(user.user_id,'streamer'); const c=await campaignOwner(p[1],user.user_id);
    if(c.state!=='funded') throw new ApiError('FUNDING_REQUIRED',409);
    if(!c.source_asset_id || !c.license_terms || !c.fixed_reward_lamports || !c.target_platforms?.length) throw new ApiError('CAMPAIGN_INCOMPLETE',422);
    const escrow=await one<any>('SELECT * FROM escrow_accounts WHERE campaign_id=$1',[p[1]]);
    if(BigInt(escrow.funded_lamports)<BigInt(c.fixed_reward_lamports)) throw new ApiError('INSUFFICIENT_ESCROW',409);
    const updated=await one<any>("UPDATE campaigns SET state='live',updated_at=now() WHERE id=$1 AND state='funded' RETURNING *",[p[1]]);
    await audit(db,user.user_id,'campaign.published','campaign',p[1]); return reply(updated);
  }
  if(method==='POST' && p[0]==='campaigns' && p[2]==='join') {
    await gate(user.user_id,'clipper');
    const c=await one<any>('SELECT * FROM campaigns WHERE id=$1',[p[1]]);
    if(!c || c.state!=='live' || c.streamer_id===user.user_id) throw new ApiError('CAMPAIGN_NOT_JOINABLE',409);
    const fee=await one<any>("SELECT * FROM fee_intents WHERE campaign_id=$1 AND user_id=$2 AND purpose='entry' AND state='verified'",[p[1],user.user_id]);
    if(BigInt(c.entry_fee_raw)>0n && !fee) throw new ApiError('ENTRY_FEE_REQUIRED',409);
    const row=await one<any>('INSERT INTO campaign_memberships(campaign_id,clipper_id,fee_intent_id) VALUES($1,$2,$3) ON CONFLICT(campaign_id,clipper_id) DO UPDATE SET id=campaign_memberships.id RETURNING *',[p[1],user.user_id,fee?.id]);
    return reply(row,201);
  }
  if(method==='GET' && p[0]==='campaigns' && p[2]==='submissions') {
    const c=await campaignOwner(p[1],user.user_id);
    const rows=await db.query('SELECT s.*,u.display_name AS clipper_name FROM submissions s JOIN users u ON u.id=s.clipper_id WHERE s.campaign_id=$1 ORDER BY s.created_at DESC',[c.id]); return reply(rows.rows);
  }
  if(method==='POST' && p[0]==='campaigns' && p[2]==='submissions') {
    await gate(user.user_id,'clipper');
    const member=await one<any>('SELECT id FROM campaign_memberships WHERE campaign_id=$1 AND clipper_id=$2',[p[1],user.user_id]);
    if(!member) throw new ApiError('JOIN_REQUIRED',403);
    const c=await one<any>('SELECT * FROM campaigns WHERE id=$1',[p[1]]); if(c?.state!=='live') throw new ApiError('CAMPAIGN_NOT_LIVE',409);
    const data=await body(request,z.object({assetId:uuid,socialUrl:z.url().max(2000).optional()}));
    const asset=await one<any>("SELECT id,sha256 FROM media_assets WHERE id=$1 AND owner_id=$2 AND kind='clip' AND status='verified'",[data.assetId,user.user_id]);
    if(!asset) throw new ApiError('ASSET_REQUIRED',422);
    try {
      const row=await one<any>('INSERT INTO submissions(campaign_id,clipper_id,asset_id,media_sha256,social_url) VALUES($1,$2,$3,$4,$5) RETURNING *',[p[1],user.user_id,asset.id,asset.sha256,data.socialUrl]);
      await audit(db,user.user_id,'submission.created','submission',row.id); return reply(row,201);
    } catch(e:any) {if(e.code==='23505') throw new ApiError('DUPLICATE_SUBMISSION',409); throw e;}
  }
  if(method==='POST' && p[0]==='submissions' && p[2]==='review') {
    await gate(user.user_id,'streamer');
    const data=await body(request,z.object({decision:z.enum(['approved','rejected']),reason:z.string().min(3).max(1000)}));
    const s=await one<any>('SELECT * FROM submissions WHERE id=$1',[p[1]]); if(!s) throw new ApiError('NOT_FOUND',404);
    const campaign=await campaignOwner(s.campaign_id,user.user_id);
    if(data.decision==='approved') await requireMoney();
    const updated=await tx(async client=>{
      const locked=await one<any>('SELECT * FROM submissions WHERE id=$1 FOR UPDATE',[p[1]],client);
      if(!['submitted','in_review'].includes(locked.state)) throw new ApiError('SUBMISSION_ALREADY_REVIEWED',409);
      if(data.decision==='approved') {
        const amount=BigInt(campaign.fixed_reward_lamports);
        if(amount<=0n) throw new ApiError('REWARD_NOT_CONFIGURED',409);
        const recipient=await one<{address:string}>('SELECT address FROM wallets WHERE user_id=$1',[locked.clipper_id],client);
        if(!recipient) throw new ApiError('CLIPPER_WALLET_REQUIRED',409);
        const reserved=await one('UPDATE escrow_accounts SET reserved_lamports=reserved_lamports+$2,updated_at=now() WHERE campaign_id=$1 AND funded_lamports-reserved_lamports-paid_lamports >= $2 RETURNING campaign_id',[locked.campaign_id,String(amount)],client);
        if(!reserved) throw new ApiError('INSUFFICIENT_ESCROW',409);
        await client.query('INSERT INTO reward_awards(submission_id,campaign_id,clipper_id,recipient,lamports) VALUES($1,$2,$3,$4,$5)',[locked.id,locked.campaign_id,locked.clipper_id,recipient.address,String(amount)]);
      }
      const result=await one<any>('UPDATE submissions SET state=$2,review_reason=$3,reviewed_by=$4,updated_at=now() WHERE id=$1 RETURNING *',[p[1],data.decision,data.reason,user.user_id],client);
      await audit(client,user.user_id,'submission.reviewed','submission',p[1],data);
      return result;
    });
    return reply(updated);
  }
  if(method==='GET' && p.join('/')==='me/rewards') {
    const rows=await db.query('SELECT id,submission_id,campaign_id,lamports,state,available_at,signature,paid_at FROM reward_awards WHERE clipper_id=$1 ORDER BY created_at DESC',[user.user_id]);
    return reply(rows.rows);
  }
  if(method==='POST' && p[0]==='rewards' && p[2]==='dispute') {
    const data=await body(request,z.object({reason:z.string().min(10).max(1000)}));
    const award=await one<any>("UPDATE reward_awards SET state='disputed',updated_at=now() WHERE id=$1 AND clipper_id=$2 AND state IN ('held','ready') RETURNING id",[p[1],user.user_id]);
    if(!award) throw new ApiError('REWARD_NOT_DISPUTABLE',409);
    await audit(db,user.user_id,'reward.disputed','reward_award',award.id,{reason:data.reason});return reply({ok:true});
  }
  throw new ApiError('NOT_FOUND',404);
}
async function dispatch(r:Request,c:Context,method:string) {
  const requestId=crypto.randomUUID();
  try {return await handle(r,(await c.params).path,method);} catch(e) {return jsonError(e,requestId);}
}
export async function GET(r:Request,c:Context) {return dispatch(r,c,'GET');}
export async function POST(r:Request,c:Context) {return dispatch(r,c,'POST');}
export async function PATCH(r:Request,c:Context) {return dispatch(r,c,'PATCH');}
