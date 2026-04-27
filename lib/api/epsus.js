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

export async function ensureInvite({ epsuId, inviteRole }) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('ensure_epsu_invite', {
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

export async function createEpsuSuggestion({ title, countryCode }) {
  const supabase = requireSupabase();
  const normalizedCountryCode = countryCode?.trim().toUpperCase() ?? null;

  if (!normalizedCountryCode || normalizedCountryCode.length !== 2) {
    return { ok: false, message: 'Choose a country first' };
  }

  const { data, error } = await supabase.rpc('submit_regional_epsu_suggestion', {
    p_title: title,
    p_country_code: normalizedCountryCode,
  });

  if (error) {
    throw error;
  }

  return data;
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
    .eq('status', 'active');

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
    .eq('status', 'active');

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => row.epsu_id);
}

export async function fetchEpsuMemberships(epsuId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('epsu_memberships')
    .select('id, epsu_id, role, status, profile_id, profiles(email)')
    .eq('epsu_id', epsuId)
    .neq('status', 'left')
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((membership) => ({
    id: membership.id,
    epsuId: membership.epsu_id,
    role: membership.role,
    status: membership.status,
    profileId: membership.profile_id,
    email: membership.profiles?.email ?? null,
  }));
}
