import { ApiError, assertOrigin, createSession, jsonError } from '@/lib/auth';
import { one, tx } from '@/lib/db';

export const runtime = 'nodejs';

function getSupabaseConfig() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!rawUrl || !anonKey) throw new ApiError('SUPABASE_AUTH_NOT_CONFIGURED', 503);

  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Invalid Supabase URL');
    url.pathname = url.pathname.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
    url.search = '';
    url.hash = '';
    return { url: url.toString().replace(/\/$/, ''), anonKey };
  } catch {
    throw new ApiError('SUPABASE_AUTH_NOT_CONFIGURED', 503, 'The Supabase project URL is invalid.');
  }
}

type SupabaseUser = {
  id?: string;
  email?: string;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  user_metadata?: Record<string, unknown>;
};

async function provisionUser(identity: SupabaseUser) {
  const supabaseId = identity.id;
  const email = identity.email?.trim().toLowerCase();
  if (!supabaseId || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError('SUPABASE_IDENTITY_INVALID', 401, 'Supabase did not return a valid user identity.');
  }

  const metadata = identity.user_metadata || {};
  const candidateName = metadata.full_name || metadata.name || email.split('@')[0];
  const displayName = String(candidateName).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100) || email;
  const selectedRole = metadata.role === 'streamer' ? 'streamer' : 'clipper';

  return tx(async (client) => {
    const linked = await one<{ id: string }>(
      'SELECT id FROM users WHERE supabase_user_id=$1 FOR UPDATE',
      [supabaseId], client,
    );
    if (linked) {
      await client.query(
        "UPDATE users SET email=$2,display_name=CASE WHEN users.display_name_customized THEN users.display_name ELSE $3 END,auth_provider='supabase',email_verified=true,updated_at=now() WHERE id=$1",
        [linked.id, email, displayName],
      );
      return linked.id;
    }

    const byEmail = await one<{ id: string; supabase_user_id: string | null }>(
      'SELECT id,supabase_user_id FROM users WHERE lower(email)=lower($1) ORDER BY created_at LIMIT 1 FOR UPDATE',
      [email], client,
    );
    if (byEmail) {
      if (byEmail.supabase_user_id && byEmail.supabase_user_id !== supabaseId) {
        throw new ApiError('IDENTITY_LINK_CONFLICT', 409, 'This email is already linked to a different Supabase account.');
      }
      await client.query(
        "UPDATE users SET supabase_user_id=$2,email=$3,display_name=CASE WHEN users.display_name_customized THEN users.display_name ELSE $4 END,auth_provider='supabase',email_verified=true,updated_at=now() WHERE id=$1",
        [byEmail.id, supabaseId, email, displayName],
      );
      return byEmail.id;
    }

    const created = await one<{ id: string }>(
      "INSERT INTO users(google_sub,supabase_user_id,email,display_name,roles,auth_provider,email_verified) VALUES(NULL,$1,$2,$3,$4,'supabase',true) RETURNING id",
      [supabaseId, email, displayName, [selectedRole]], client,
    );
    if (!created) throw new Error('Supabase user provisioning failed');
    return created.id;
  });
}

export async function POST(request: Request) {
  try {
    await assertOrigin(request);
    const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token || token.length > 16_384) throw new ApiError('SUPABASE_TOKEN_REQUIRED', 401);

    const { url, anonKey } = getSupabaseConfig();
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anonKey, authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new ApiError('SUPABASE_SESSION_INVALID', 401, 'Your Supabase sign-in expired. Please sign in again.');

    const identity = await response.json() as SupabaseUser;
    if (!identity.email_confirmed_at && !identity.confirmed_at) {
      throw new ApiError('EMAIL_NOT_CONFIRMED', 403, 'Confirm your email address before opening the workspace.');
    }

    const userId = await provisionUser(identity);
    await createSession(userId);
    return Response.json({ ok: true, provider: 'supabase' });
  } catch (error) {
    return jsonError(error, crypto.randomUUID());
  }
}
