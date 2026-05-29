import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.100.1';

const SITE_URL = 'https://epsu.site';
const MOBILE_HANDOFF_PAGE_URL = `${SITE_URL}/auth-handoff.html`;

type JsonRecord = Record<string, unknown>;

type RequestBody =
  | {
      action: 'create_handoff';
      token_hash: string;
      type: string;
      purpose?: string;
    }
  | {
      action: 'redeem_handoff';
      token: string;
    };

function jsonResponse(body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  });
}

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing required secret: ${name}`);
  }
  return value;
}

function getRequiredEnvFromCandidates(names: string[]) {
  for (const name of names) {
    const value = Deno.env.get(name)?.trim();
    if (value) {
      return value;
    }
  }

  throw new Error(`Missing required secret: one of ${names.join(', ')}`);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function createRandomToken(bytes = 24) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return btoa(String.fromCharCode(...buffer))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createShortCode() {
  return `${createRandomToken(3).replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase()}-${createRandomToken(3)
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 4)
    .toUpperCase()}`;
}

async function verifyConfirmationLink(
  supabaseUrl: string,
  anonKey: string,
  tokenHash: string,
  type: string
) {
  const authSupabase = createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await authSupabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data.user?.id || !data.user.email) {
    throw new Error('Could not verify this confirmation link');
  }

  return {
    userId: data.user.id,
    email: normalizeEmail(data.user.email),
  };
}

async function handleCreateHandoff(
  serviceSupabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  anonKey: string,
  body: Extract<RequestBody, { action: 'create_handoff' }>
) {
  const purpose = body.purpose === 'password_reset_mobile_recovery'
    ? 'password_reset_mobile_recovery'
    : 'signup_confirm_mobile_login';
  const verified = await verifyConfirmationLink(
    supabaseUrl,
    anonKey,
    body.token_hash,
    body.type
  );

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const handoffToken = createRandomToken(24);
  const shortCode = createShortCode();

  const { error } = await serviceSupabase.from('auth_handoffs').insert({
    user_id: verified.userId,
    email: verified.email,
    handoff_token: handoffToken,
    short_code: shortCode,
    purpose,
    expires_at: expiresAt,
  });

  if (error) {
    throw new Error(error.message);
  }

  return jsonResponse({
    ok: true,
    email: verified.email,
    handoffUrl: `${MOBILE_HANDOFF_PAGE_URL}?token=${encodeURIComponent(handoffToken)}&purpose=${encodeURIComponent(purpose)}`,
    shortCode,
    expiresAt,
  });
}

async function generateMobileMagicLink(
  supabaseUrl: string,
  serviceRoleKey: string,
  email: string,
  purpose: string
) {
  const linkType = purpose === 'password_reset_mobile_recovery'
    ? 'recovery'
    : 'magiclink';
  const redirectTo = purpose === 'password_reset_mobile_recovery'
    ? `${SITE_URL}/reset-password.html`
    : `${SITE_URL}/auth-confirm.html`;
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      type: linkType,
      email,
      redirect_to: redirectTo,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.msg ?? payload?.error_description ?? payload?.error ?? 'Could not create mobile login link');
  }

  const tokenHash = payload?.hashed_token;
  if (!tokenHash) {
    throw new Error('Mobile login link did not include a token hash');
  }

  return {
    tokenHash,
    type: linkType,
  };
}

async function handleRedeemHandoff(
  serviceSupabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
  body: Extract<RequestBody, { action: 'redeem_handoff' }>
) {
  const token = body.token.trim();
  if (!token) {
    return jsonResponse({ error: 'Auth handoff token is required' }, 400);
  }

  const nowIso = new Date().toISOString();
  const { data: handoffRecord, error: handoffError } = await serviceSupabase
    .from('auth_handoffs')
    .select('id, user_id, email, purpose, expires_at, used_at')
    .eq('handoff_token', token)
    .maybeSingle();

  if (handoffError) {
    throw new Error(handoffError.message);
  }

  if (!handoffRecord) {
    return jsonResponse({ error: 'This phone login QR is invalid' }, 400);
  }

  if (handoffRecord.used_at) {
    return jsonResponse({ error: 'This phone login QR was already used' }, 400);
  }

  if (new Date(handoffRecord.expires_at).getTime() <= Date.now()) {
    return jsonResponse({ error: 'This phone login QR expired. Reopen the confirmation page and generate a new one.' }, 400);
  }

  const magicLink = await generateMobileMagicLink(
    supabaseUrl,
    serviceRoleKey,
    handoffRecord.email,
    handoffRecord.purpose
  );

  const { error: updateError } = await serviceSupabase
    .from('auth_handoffs')
    .update({
      used_at: nowIso,
    })
    .eq('id', handoffRecord.id)
    .is('used_at', null);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return jsonResponse({
    ok: true,
    tokenHash: magicLink.tokenHash,
    type: magicLink.type,
    email: handoffRecord.email,
    purpose: handoffRecord.purpose,
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  try {
    const supabaseUrl = getRequiredEnv('SUPABASE_URL');
    const serviceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = getRequiredEnvFromCandidates([
      'EPSU_SUPABASE_ANON_KEY',
      'EXPO_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_ANON_KEY',
    ]);

    const serviceSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    if (body.action === 'create_handoff') {
      return await handleCreateHandoff(serviceSupabase, supabaseUrl, anonKey, body);
    }

    if (body.action === 'redeem_handoff') {
      return await handleRedeemHandoff(serviceSupabase, supabaseUrl, serviceRoleKey, body);
    }

    return jsonResponse({ error: 'Unsupported action' }, 400);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Unexpected function error' },
      500
    );
  }
});
