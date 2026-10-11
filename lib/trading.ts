import {Connection,PublicKey,TransactionInstruction,TransactionMessage,VersionedTransaction} from '@solana/web3.js';
import {NATIVE_MINT,TOKEN_2022_PROGRAM_ID,TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {OnlinePumpSdk,PUMP_PROGRAM_ID,PUMP_SDK,bondingCurvePda,getBuyTokenAmountFromSolAmount,getSellSolAmountFromTokenAmount,isBondingCurveMigrated} from '@pump-fun/pump-sdk';
import BN from 'bn.js';
import {config} from './config';
import {ApiError} from './auth';
import bs58 from 'bs58';

export const SOL_MINT='So11111111111111111111111111111111111111112';
export type TradeSide='buy'|'sell';
export type TradeRoute='pump'|'jupiter';
export type TradeInput={mint:string;wallet:string;side:TradeSide;amountRaw:string;slippageBps:number};
export type TradeQuote={route:TradeRoute;mint:string;wallet:string;side:TradeSide;amountInRaw:string;amountOutRaw:string;slippageBps:number;priceImpactPct?:string;routeLabels?:string[]};

type JupiterInstruction={programId:string;accounts:{pubkey:string,isSigner:boolean,isWritable:boolean}[];data:string};
type JupiterBuild={inputMint:string;outputMint:string;inAmount:string;outAmount:string;otherAmountThreshold:string;slippageBps:number;priceImpactPct:string;routePlan?:{swapInfo?:{label?:string}}[];computeBudgetInstructions:JupiterInstruction[];setupInstructions:JupiterInstruction[];swapInstruction:JupiterInstruction;cleanupInstruction:JupiterInstruction|null;otherInstructions:JupiterInstruction[];tipInstruction:JupiterInstruction|null;addressesByLookupTableAddress?:Record<string,string[]>;transactionVersion:number;computeUnitPrice?:string};

const connection=()=>new Connection(config.rpc,'confirmed');
const jupiterUrl='https://api.jup.ag/swap/v2/build';
const maxComputeUnits=1_400_000;

export function assertTradingEnabled(){
  if(!config.tradingEnabled) throw new ApiError('TRADING_DISABLED',503,'Trading is not enabled for this deployment.');
  if(config.cluster!=='mainnet-beta' && config.cluster!=='devnet') throw new ApiError('UNSUPPORTED_SOLANA_CLUSTER',503);
}
export function parseTradeInput(input:unknown):TradeInput{
  if(!input || typeof input!=='object') throw new ApiError('INVALID_INPUT',400);
  const value=input as Record<string,unknown>;
  const mint=String(value.mint||'');
  const wallet=String(value.wallet||'');
  const side=value.side==='sell'?'sell':'buy';
  const amountRaw=String(value.amountRaw||'');
  const slippageBps=Number(value.slippageBps??100);
  try{new PublicKey(mint);new PublicKey(wallet);}catch{throw new ApiError('INVALID_ADDRESS',422);}
  if(!/^[1-9][0-9]{0,18}$/.test(amountRaw)) throw new ApiError('INVALID_AMOUNT',422,'Amount must be a positive integer in the token input unit.');
  if(!Number.isInteger(slippageBps)||slippageBps<50||slippageBps>500) throw new ApiError('SLIPPAGE_OUT_OF_RANGE',422,'Slippage must be between 0.5% and 5%.');
  if(side==='buy' && BigInt(amountRaw)>config.tradingMaxSolLamports) throw new ApiError('TRADE_AMOUNT_TOO_LARGE',422,'This buy exceeds the configured SOL limit.');
  return {mint,wallet,side,amountRaw,slippageBps};
}

async function mintProgram(mint:PublicKey){
  const info=await connection().getAccountInfo(mint);
  if(!info) throw new ApiError('MINT_NOT_FOUND',404);
  return info.owner.equals(TOKEN_2022_PROGRAM_ID)?TOKEN_2022_PROGRAM_ID:TOKEN_PROGRAM_ID;
}

export async function detectTradeRoute(mintText:string):Promise<TradeRoute>{
  const mint=new PublicKey(mintText);
  const c=connection();
  const curveInfo=await c.getAccountInfo(bondingCurvePda(mint));
  if(curveInfo?.owner.equals(PUMP_PROGRAM_ID)){
    const curve=PUMP_SDK.decodeBondingCurve(curveInfo);
    if(!isBondingCurveMigrated(curve) && (curve.quoteMint.equals(PublicKey.default)||curve.quoteMint.equals(NATIVE_MINT))) return 'pump';
  }
  return 'jupiter';
}

async function pumpQuote(input:TradeInput):Promise<TradeQuote>{
  const c=connection();
  const mint=new PublicKey(input.mint), wallet=new PublicKey(input.wallet);
  const tokenProgram=await mintProgram(mint);
  const sdk=new OnlinePumpSdk(c);
  const [global,state]=await Promise.all([sdk.fetchGlobal(),sdk.fetchBuyState(mint,wallet,tokenProgram)]);
  if(!state.quoteMint.equals(NATIVE_MINT)) throw new ApiError('PUMP_QUOTE_NOT_SOL',422,'This Pump curve is not SOL-quoted; use Jupiter routing instead.');
  const feeConfig=await sdk.fetchFeeConfig().catch(()=>null);
  const amount=new BN(input.amountRaw);
  const amountOut=input.side==='buy'
    ? getBuyTokenAmountFromSolAmount({global,feeConfig,mintSupply:state.bondingCurve.tokenTotalSupply,bondingCurve:state.bondingCurve,amount,quoteMint:state.quoteMint})
    : getSellSolAmountFromTokenAmount({global,feeConfig,mintSupply:state.bondingCurve.tokenTotalSupply,bondingCurve:state.bondingCurve,amount});
  const maxOrMin=input.side==='buy'
    ? amountOut.muln(10_000-input.slippageBps).divn(10_000)
    : amountOut.muln(10_000-input.slippageBps).divn(10_000);
  return {route:'pump',mint:input.mint,wallet:input.wallet,side:input.side,amountInRaw:input.amountRaw,amountOutRaw:maxOrMin.toString(),slippageBps:input.slippageBps,routeLabels:['Pump.fun bonding curve']};
}

async function jupiterBuild(input:TradeInput):Promise<JupiterBuild>{
  if(!config.jupiterApiKey) throw new ApiError('JUPITER_API_KEY_MISSING',503,'Jupiter trading is not configured.');
  const params=new URLSearchParams({
    inputMint:input.side==='buy'?SOL_MINT:input.mint,
    outputMint:input.side==='buy'?input.mint:SOL_MINT,
    amount:input.amountRaw,
    taker:input.wallet,
    slippageBps:String(input.slippageBps),
    transactionVersion:'0',
    maxAccounts:'64',
    wrapAndUnwrapSol:'true',
    computeUnitPricePercentile:'veryHigh',
    blockhashSlotsToExpiry:'120',
  });
  const response=await fetch(`${jupiterUrl}?${params}`,{headers:{'x-api-key':config.jupiterApiKey,accept:'application/json'},signal:AbortSignal.timeout(15000)});
  const body=await response.json().catch(()=>null) as JupiterBuild|null;
  if(!response.ok||!body?.swapInstruction) throw new ApiError('JUPITER_BUILD_FAILED',502,typeof body==='object'&&body&&'error' in body?String((body as Record<string,unknown>).error):`Jupiter returned ${response.status}.`);
  return body;
}

export async function getTradeQuote(input:TradeInput):Promise<TradeQuote>{
  assertTradingEnabled();
  const route=await detectTradeRoute(input.mint);
  if(route==='pump') return pumpQuote(input);
  const build=await jupiterBuild(input);
  return {route:'jupiter',mint:input.mint,wallet:input.wallet,side:input.side,amountInRaw:build.inAmount,amountOutRaw:build.outAmount,slippageBps:build.slippageBps,priceImpactPct:build.priceImpactPct,routeLabels:(build.routePlan||[]).map(item=>item.swapInfo?.label).filter((x):x is string=>Boolean(x))};
}

function ix(value:JupiterInstruction){return new TransactionInstruction({programId:new PublicKey(value.programId),keys:value.accounts.map(account=>({pubkey:new PublicKey(account.pubkey),isSigner:account.isSigner,isWritable:account.isWritable})),data:Buffer.from(value.data,'base64')});}
async function lookupTables(addresses:Record<string,string[]>|undefined){
  const keys=Object.keys(addresses||{});
  const results=await Promise.all(keys.map(async key=>(await connection().getAddressLookupTable(new PublicKey(key))).value));
  return results.filter((value):value is NonNullable<typeof value>=>Boolean(value));
}

async function buildPumpTransaction(input:TradeInput){
  const c=connection(), mint=new PublicKey(input.mint), wallet=new PublicKey(input.wallet), tokenProgram=await mintProgram(mint), sdk=new OnlinePumpSdk(c);
  const [global,feeConfig,state]=await Promise.all([sdk.fetchGlobal(),sdk.fetchFeeConfig().catch(()=>null),sdk.fetchBuyState(mint,wallet,tokenProgram)]);
  if(!state.quoteMint.equals(NATIVE_MINT)) throw new ApiError('PUMP_QUOTE_NOT_SOL',422);
  const amount=new BN(input.amountRaw);
  let instructions:TransactionInstruction[], quoteOut:BN;
  if(input.side==='buy'){
    quoteOut=getBuyTokenAmountFromSolAmount({global,feeConfig,mintSupply:state.bondingCurve.tokenTotalSupply,bondingCurve:state.bondingCurve,amount,quoteMint:state.quoteMint});
    instructions=await PUMP_SDK.buyInstructions({global,bondingCurveAccountInfo:state.bondingCurveAccountInfo,bondingCurve:state.bondingCurve,associatedUserAccountInfo:state.associatedUserAccountInfo,mint,user:wallet,amount:quoteOut,solAmount:amount,slippage:input.slippageBps/100,tokenProgram});
  }else{
    quoteOut=getSellSolAmountFromTokenAmount({global,feeConfig,mintSupply:state.bondingCurve.tokenTotalSupply,bondingCurve:state.bondingCurve,amount});
    instructions=await PUMP_SDK.sellInstructions({global,bondingCurveAccountInfo:state.bondingCurveAccountInfo,bondingCurve:state.bondingCurve,mint,user:wallet,amount,solAmount:quoteOut,slippage:input.slippageBps/100,tokenProgram,mayhemMode:state.bondingCurve.isMayhemMode});
  }
  return finalizeTransaction(wallet,instructions,[],{amountOutRaw:quoteOut.toString(),route:'pump'});
}

async function buildJupiterTransaction(input:TradeInput){
  const build=await jupiterBuild(input);
  const rawInstructions:JupiterInstruction[]=[...build.computeBudgetInstructions,...build.setupInstructions,build.swapInstruction,...(build.cleanupInstruction?[build.cleanupInstruction]:[]),...build.otherInstructions,...(build.tipInstruction?[build.tipInstruction]:[])];
  const instructions=rawInstructions.map(ix);
  const alts=await lookupTables(build.addressesByLookupTableAddress);
  const result=await finalizeTransaction(new PublicKey(input.wallet),instructions,alts,{amountOutRaw:build.outAmount,route:'jupiter',priceImpactPct:build.priceImpactPct,routeLabels:(build.routePlan||[]).map(item=>item.swapInfo?.label).filter((x):x is string=>Boolean(x))});
  return {...result,quote:build};
}

async function finalizeTransaction(wallet:PublicKey,instructions:TransactionInstruction[],addressLookupTables:{key:PublicKey;state:unknown}[],metadata:Record<string,unknown>){
  const latest=await connection().getLatestBlockhash('confirmed');
  const message=new TransactionMessage({payerKey:wallet,recentBlockhash:latest.blockhash,instructions}).compileToV0Message(addressLookupTables as never);
  const transaction=new VersionedTransaction(message);
  return {serializedTransaction:Buffer.from(transaction.serialize()).toString('base64'),lastValidBlockHeight:latest.lastValidBlockHeight,...metadata};
}

export async function buildTradeTransaction(input:TradeInput){
  assertTradingEnabled();
  const route=await detectTradeRoute(input.mint);
  return route==='pump'?buildPumpTransaction(input):buildJupiterTransaction(input);
}

export function decodeSignedTransaction(value:string){
  try{return VersionedTransaction.deserialize(Buffer.from(value,'base64'));}catch{throw new ApiError('INVALID_TRANSACTION',422);}
}
export function solscanUrl(signature:string){return `https://solscan.io/tx/${encodeURIComponent(signature)}${config.cluster==='devnet'?'?cluster=devnet':''}`;}
export function walletAddress(transaction:VersionedTransaction){return transaction.message.staticAccountKeys[0]?.toBase58()||'';}
export function blockhashBytesToBase58(value:number[]|undefined){return value?bs58.encode(Uint8Array.from(value)):'';}
export const TRADE_MAX_COMPUTE_UNITS=maxComputeUnits;
