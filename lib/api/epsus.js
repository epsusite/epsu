import { requireSupabase } from '../supabase';

async function isPlatformAdmin(userId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('is_platform_admin', {
    target_profile_id: userId,
  });

  if (error) {
    throw error;
  }

  return Boolean(data);
}

async function fetchAllEpsuIds() {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('epsus')
    .select('id');

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => row.id);
}

export async function fetchEpsuPopulationCounts(epsuIds) {
  const supabase = requireSupabase();

  if (!epsuIds.length) {
    return {};
  }

  const { data, error } = await supabase.rpc('fetch_epsu_population_counts', {
    p_epsu_ids: epsuIds,
  });

  if (error) {
    throw error;
  }

  return (data ?? []).reduce((accumulator, row) => {
    accumulator[row.epsu_id] = {
      memberCount: row.member_count ?? 0,
      onlineCount: row.online_count ?? 0,
    };
    return accumulator;
  }, {});
}

export async function fetchEpsuActivePostCounts(epsuIds) {
  const supabase = requireSupabase();

  if (!epsuIds.length) {
    return {};
  }

  const { data, error } = await supabase.rpc('fetch_epsu_active_post_counts', {
    p_epsu_ids: epsuIds,
  });

  if (error) {
    throw error;
  }

  return (data ?? []).reduce((accumulator, row) => {
    accumulator[row.epsu_id] = Number(row.active_post_count ?? 0);
    return accumulator;
  }, {});
}

export async function syncEpsuPresence(epsuIds) {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc('sync_epsu_presence', {
    p_epsu_ids: epsuIds,
  });

  if (error) {
    throw error;
  }
}

export async function clearEpsuPresence() {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc('clear_epsu_presence');

  if (error) {
    throw error;
  }
}

export async function joinPublicEpsu(epsuId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('join_public_epsu', {
    p_epsu_id: epsuId,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function ensureInvite({ epsuId, inviteRole, forceNew = false }) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('ensure_epsu_invite', {
    p_epsu_id: epsuId,
    p_invite_role: inviteRole,
    p_force_new: forceNew,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchInviteStatus({ epsuId, inviteRole }) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('fetch_epsu_invite_status', {
    p_epsu_id: epsuId,
    p_invite_role: inviteRole,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function redeemInvite({ token }) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('redeem_epsu_invite', {
    p_token: token,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function createRegionalEpsu({ title, countryCode }) {
  const supabase = requireSupabase();
  const normalizedTitle = title?.trim() ?? '';
  const normalizedCountryCode = countryCode?.trim().toUpperCase() ?? null;

  if (normalizedTitle.length < 2 || normalizedTitle.length > 100) {
    return { ok: false, message: 'Location must be between 2 and 100 characters' };
  }

  if (!normalizedCountryCode || normalizedCountryCode.length !== 2) {
    return { ok: false, message: 'Choose a country first' };
  }

  const { data, error } = await supabase.rpc('create_regional_epsu', {
    p_title: normalizedTitle,
    p_country_code: normalizedCountryCode,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function createEpsuSuggestion({ title, countryCode }) {
  return createRegionalEpsu({ title, countryCode });
}

export async function fetchTrialEpsuCreatorState() {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('fetch_trial_epsu_creator_state');

  if (error) {
    throw error;
  }

  return {
    isLocked: Boolean(data?.isLocked),
    hasPendingSubmission: Boolean(data?.hasPendingSubmission),
    cooldownUntil: data?.cooldownUntil ?? null,
    pendingSubmissionType: data?.pendingSubmissionType ?? null,
    pendingTitle: data?.pendingTitle ?? null,
  };
}

export async function fetchModeratedEpsuIds(userId) {
  if (await isPlatformAdmin(userId)) {
    return fetchAllEpsuIds();
  }

  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('epsu_memberships')
    .select('epsu_id, role')
    .eq('profile_id', userId)
    .in('role', ['moderator', 'host'])
    .in('status', ['active', 'muted']);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => row.epsu_id);
}

export async function fetchHostedEpsuIds(userId) {
  if (await isPlatformAdmin(userId)) {
    return fetchAllEpsuIds();
  }

  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('epsu_memberships')
    .select('epsu_id')
    .eq('profile_id', userId)
    .eq('role', 'host')
    .in('status', ['active', 'muted']);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => row.epsu_id);
}

export async function fetchEpsuMemberships(epsuId, options = {}) {
  const supabase = requireSupabase();
  const includePlatformAdmins = options.includePlatformAdmins === true;
  const membershipQuery = supabase
    .from('epsu_memberships')
    .select('id, epsu_id, role, status, profile_id, profiles(email)')
    .eq('epsu_id', epsuId)
    .neq('status', 'left')
    .order('created_at', { ascending: true });
  const adminQuery = includePlatformAdmins
    ? supabase
      .from('profiles')
      .select('id, email')
      .eq('is_admin', true)
    : Promise.resolve({ data: [], error: null });
  const [{ data, error }, { data: adminRows, error: adminError }] = await Promise.all([
    membershipQuery,
    adminQuery,
  ]);

  if (error) {
    throw error;
  }

  if (adminError) {
    throw adminError;
  }

  const platformAdmins = adminRows ?? [];
  const platformAdminIds = new Set(platformAdmins.map((row) => row.id).filter(Boolean));
  const memberships = (data ?? []).map((membership) => ({
    id: membership.id,
    epsuId: membership.epsu_id,
    role: membership.role,
    status: membership.status,
    profileId: membership.profile_id,
    email: membership.profiles?.email ?? null,
    isAdmin: platformAdminIds.has(membership.profile_id),
  }));
  const knownProfileIds = new Set(memberships.map((membership) => membership.profileId).filter(Boolean));

  if (!includePlatformAdmins) {
    return memberships;
  }

  const syntheticAdmins = platformAdmins
    .filter((row) => row?.id && !knownProfileIds.has(row.id))
    .map((row) => ({
      id: `platform-admin:${epsuId}:${row.id}`,
      epsuId,
      role: 'member',
      status: 'active',
      profileId: row.id,
      email: row.email ?? null,
      isAdmin: true,
    }));

  return [...memberships, ...syntheticAdmins];
}
