import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.100.1';

type HealthCheckResult = {
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
};

type AdminProfile = {
  id: string;
};

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

async function runDatabaseReadCheck(supabase: ReturnType<typeof createClient>): Promise<HealthCheckResult> {
  const { count, error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true });

  if (error) {
    return {
      ok: false,
      message: `Database read failed: ${error.message}`,
    };
  }

  return {
    ok: true,
    message: 'Database read succeeded',
    details: {
      profileCount: count ?? 0,
    },
  };
}

async function runStorageCheck(supabase: ReturnType<typeof createClient>): Promise<HealthCheckResult> {
  const { data, error } = await supabase.storage.listBuckets();

  if (error) {
    return {
      ok: false,
      message: `Storage check failed: ${error.message}`,
    };
  }

  return {
    ok: true,
    message: 'Storage check succeeded',
    details: {
      bucketCount: Array.isArray(data) ? data.length : 0,
    },
  };
}

async function runAuthCheck(supabase: ReturnType<typeof createClient>): Promise<HealthCheckResult> {
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1,
  });

  if (error) {
    return {
      ok: false,
      message: `Auth check failed: ${error.message}`,
    };
  }

  return {
    ok: true,
    message: 'Auth check succeeded',
    details: {
      pageUserCount: Array.isArray(data?.users) ? data.users.length : 0,
    },
  };
}

function buildFailureSummary(results: HealthCheckResult[]) {
  return results
    .filter((result) => !result.ok)
    .map((result) => result.message)
    .join(' | ');
}

function buildAlertBody(results: HealthCheckResult[]) {
  return results
    .filter((result) => !result.ok)
    .map((result) => result.message)
    .join('\n');
}

async function fetchAdminProfiles(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('is_admin', true);

  if (error) {
    throw new Error(`Could not load admin profiles: ${error.message}`);
  }

  return (data ?? []) as AdminProfile[];
}

async function createFailureAlerts(
  supabase: ReturnType<typeof createClient>,
  adminProfiles: AdminProfile[],
  body: string
) {
  if (!adminProfiles.length) {
    return 0;
  }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const profileIds = adminProfiles.map((profile) => profile.id);

  const { data: existingAlerts, error: alertLookupError } = await supabase
    .from('app_notifications')
    .select('profile_id')
    .eq('kind', 'system_health_alert')
    .gte('created_at', oneDayAgo)
    .in('profile_id', profileIds);

  if (alertLookupError) {
    throw new Error(`Could not check previous health alerts: ${alertLookupError.message}`);
  }

  const alertedProfileIds = new Set((existingAlerts ?? []).map((alert) => alert.profile_id));
  const rows = profileIds
    .filter((profileId) => !alertedProfileIds.has(profileId))
    .map((profileId) => ({
      profile_id: profileId,
      kind: 'system_health_alert',
      title: 'Supabase health issue detected',
      body,
      related_epsu_id: null,
    }));

  if (!rows.length) {
    return 0;
  }

  const { error: insertError } = await supabase.from('app_notifications').insert(rows);
  if (insertError) {
    throw new Error(`Could not create health alerts: ${insertError.message}`);
  }

  return rows.length;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const configuredSecret = Deno.env.get('SYSTEM_HEALTH_CHECK_SECRET')?.trim();
  const requestSecret = request.headers.get('x-epsu-system-health-secret')?.trim();

  if (!configuredSecret || !requestSecret || configuredSecret !== requestSecret) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
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

    const results = await Promise.all([
      runDatabaseReadCheck(supabase),
      runStorageCheck(supabase),
      runAuthCheck(supabase),
    ]);

    const allOk = results.every((result) => result.ok);
    const summary = allOk ? 'All health checks passed' : buildFailureSummary(results);

    const { error: healthLogError } = await supabase.from('system_health_checks').insert({
      status: allOk ? 'ok' : 'failed',
      summary,
      details: {
        checks: results,
      },
    });

    if (healthLogError) {
      return jsonResponse({ error: healthLogError.message }, 500);
    }

    let alertsCreated = 0;
    if (!allOk) {
      const adminProfiles = await fetchAdminProfiles(supabase);
      alertsCreated = await createFailureAlerts(supabase, adminProfiles, buildAlertBody(results));
    }

    return jsonResponse({
      ok: true,
      status: allOk ? 'ok' : 'failed',
      summary,
      alertsCreated,
      checks: results,
    });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Could not run health checks' },
      500
    );
  }
});
