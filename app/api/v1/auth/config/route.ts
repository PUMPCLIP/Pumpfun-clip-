import { NextResponse } from 'next/server';
import { config as appConfig } from '@/lib/config';

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

  let projectUrl: URL;
  try {
    projectUrl = new URL(url);
    if (projectUrl.protocol !== 'https:' && projectUrl.protocol !== 'http:') {
      throw new Error('Unsupported Supabase URL protocol');
    }
    projectUrl.pathname = projectUrl.pathname.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
    projectUrl.search = '';
    projectUrl.hash = '';
  } catch {
    return NextResponse.json(
      { configured: false, message: 'The Supabase URL must be a valid project URL.' },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  }

  return NextResponse.json(
    { configured: true, url: projectUrl.toString().replace(/\/$/, ''), anonKey, appUrl: appConfig.appUrl },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
