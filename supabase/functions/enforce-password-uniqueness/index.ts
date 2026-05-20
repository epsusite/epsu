import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.100.1';

const SIGNUP_CONFIRM_REDIRECT_URL = 'https://epsu.site/auth-confirm.html';

type JsonRecord = Record<string, unknown>;

type RequestBody =
  | {
      action: 'sign_up';
      email: string;
      password: string;
      userData?: JsonRecord;
    }
  | {
      action: 'update_password';
      password: string;
      passwordLength?: number;
    };

function jsonResponse(body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
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

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return mismatch === 0;
}

async function fingerprintPassword(password: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(password));
  return Array.from(new Uint8Array(signature))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizePasswordLength(password: string, explicitLength?: number) {
  const value = typeof explicitLength === 'number' ? explicitLength : password.length;
  return Number.isFinite(value) ? value : password.length;
}

async function reservePasswordFingerprint(
  supabase: ReturnType<typeof createClient>,
  profileId: string,
  passwordFingerprint: string
) {
  const { data: existingRecord, error: existingError } = await supabase
    .from('password_fingerprints')
    .select('password_fingerprint')
    .eq('profile_id', profileId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  const previousFingerprint = existingRecord?.password_fingerprint ?? null;
  if (previousFingerprint && timingSafeEqual(previousFingerprint, passwordFingerprint)) {
    return { previousFingerprint, changed: false };
  }

  const { error } = await supabase.from('password_fingerprints').upsert(
    {
      profile_id: profileId,
      password_fingerprint: passwordFingerprint,
    },
    {
      onConflict: 'profile_id',
    }
  );

  if (error) {
    if (error.code === '23505') {
      throw new Error('This password is already used by another account');
    }
    throw new Error(error.message);
  }

  return { previousFingerprint, changed: true };
}

async function restorePasswordFingerprint(
  supabase: ReturnType<typeof createClient>,
  profileId: string,
  previousFingerprint: string | null
) {
  if (previousFingerprint) {
    await supabase.from('password_fingerprints').upsert(
      {
        profile_id: profileId,
        password_fingerprint: previousFingerprint,
      },
      {
        onConflict: 'profile_id',
      }
    );
    return;
  }

  await supabase.from('password_fingerprints').delete().eq('profile_id', profileId);
}

async function getAuthenticatedUserId(
  request: Request,
  supabase: ReturnType<typeof createClient>
) {
  const authHeader = request.headers.get('authorization') ?? '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!accessToken) {
    throw new Error('You must be signed in');
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    throw new Error('You must be signed in');
  }

  return user.id;
}

async function handleSignUp(
  supabaseUrl: string,
  anonKey: string,
  serviceSupabase: ReturnType<typeof createClient>,
  fingerprintSecret: string,
  body: Extract<RequestBody, { action: 'sign_up' }>
) {
  const signupSupabase = createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const email = normalizeEmail(body.email);
  const passwordLength = normalizePasswordLength(body.password, Number(body.userData?.password_length));
  const userData = {
    ...(body.userData ?? {}),
    password_length: passwordLength,
  };

  const { data, error } = await signupSupabase.auth.signUp({
    email,
    password: body.password,
    options: {
      emailRedirectTo: SIGNUP_CONFIRM_REDIRECT_URL,
      data: userData,
    },
  });

  if (error) {
    return jsonResponse({ error: error.message }, 400);
  }

  const userId = data.user?.id;
  if (!userId) {
    return jsonResponse({ error: 'Could not create account' }, 500);
  }

  try {
    const passwordFingerprint = await fingerprintPassword(body.password, fingerprintSecret);
    await reservePasswordFingerprint(serviceSupabase, userId, passwordFingerprint);
  } catch (error) {
    await serviceSupabase.auth.admin.deleteUser(userId).catch(() => {});
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Could not reserve password' },
      400
    );
  }

  return jsonResponse({
    ok: true,
    session: data.session,
    user: data.user,
  });
}

async function handleUpdatePassword(
  request: Request,
  serviceSupabase: ReturnType<typeof createClient>,
  fingerprintSecret: string,
  body: Extract<RequestBody, { action: 'update_password' }>
) {
  const userId = await getAuthenticatedUserId(request, serviceSupabase);
  const passwordFingerprint = await fingerprintPassword(body.password, fingerprintSecret);
  const reservation = await reservePasswordFingerprint(serviceSupabase, userId, passwordFingerprint);

  try {
    const { data: authUserData, error: authUserError } = await serviceSupabase.auth.admin.getUserById(userId);
    if (authUserError || !authUserData?.user) {
      throw new Error(authUserError?.message ?? 'Could not load account before password update');
    }

    const { error } = await serviceSupabase.auth.admin.updateUserById(userId, {
      password: body.password,
      user_metadata: {
        ...(authUserData.user.user_metadata ?? {}),
        password_length: normalizePasswordLength(body.password, body.passwordLength),
      },
    });

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    await restorePasswordFingerprint(serviceSupabase, userId, reservation.previousFingerprint);
    throw error;
  }

  return jsonResponse({ ok: true });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
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
    const fingerprintSecret = getRequiredEnv('PASSWORD_FINGERPRINT_SECRET');

    const serviceSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    if (body.action === 'sign_up') {
      return await handleSignUp(
        supabaseUrl,
        anonKey,
        serviceSupabase,
        fingerprintSecret,
        body
      );
    }

    if (body.action === 'update_password') {
      return await handleUpdatePassword(request, serviceSupabase, fingerprintSecret, body);
    }

    return jsonResponse({ error: 'Unsupported action' }, 400);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Unexpected function error' },
      500
    );
  }
});
