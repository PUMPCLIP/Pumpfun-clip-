export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(){
  // Bracket access keeps this lookup dynamic in the Render server process rather than
  // freezing the value into the client bundle during `next build`.
  const key='NEXT_PUBLIC_PRIVY_APP_ID';
  const appId=process.env[key]?.trim()||'';
  return Response.json({configured:Boolean(appId),appId:appId||null},{headers:{'Cache-Control':'no-store, max-age=0'}});
}
