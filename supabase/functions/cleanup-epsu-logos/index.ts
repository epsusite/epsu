import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.100.1';

const SCHOOL_LOGO_BUCKET = 'school-logos';

function jsonResponse(body: Record<string, unknown>, status = 200) {
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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const configuredSecret = Deno.env.get('EPSU_LOGO_CLEANUP_SECRET')?.trim();
  const requestSecret = request.headers.get('x-epsu-logo-cleanup-secret')?.trim();

  if (!configuredSecret || !requestSecret || configuredSecret !== requestSecret) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const body = await request.json().catch(() => null);
  const logoPath = typeof body?.logoPath === 'string' ? body.logoPath.trim() : '';

  if (!logoPath) {
    return jsonResponse({ ok: true, skipped: true });
  }

  try {
    const supabaseUrl = getRequiredEnv('SUPABASE_URL');
    const serviceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { error } = await supabase.storage.from(SCHOOL_LOGO_BUCKET).remove([logoPath]);
    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Could not clean up logo' },
      500
    );
  }
});
