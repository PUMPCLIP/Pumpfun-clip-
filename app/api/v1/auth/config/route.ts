import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    return NextResponse.json(
      {
        configured: false,
        message: 'Authentication is not configured yet. Add the Supabase URL and anon key to the deployment environment.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  }

  return NextResponse.json(
    { configured: true, url, anonKey },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
