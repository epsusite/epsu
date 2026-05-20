import { requireSupabase } from './supabase';

export async function ensurePlatformAdminMemberships(profileId = null) {
  const supabase = requireSupabase();
  const rpcArgs = profileId ? { p_profile_id: profileId } : {};
  const { data, error } = await supabase.rpc('ensure_platform_admin_memberships', rpcArgs);

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchEpsusWithCountry() {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('epsus')
    .select('id, slug, name, code, scope, website, review_status, country_code, logo_path, is_trial, trial_member_goal, trial_started_at, trial_ends_at, trial_converted_at, trial_created_by_profile_id')
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function fetchGuestEpsus(countryCode) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('fetch_guest_epsus', {
    p_country_code: countryCode,
  });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function fetchVisibleMemberships(userId, options = {}) {
  const supabase = requireSupabase();
  if (options.ensureAdminMemberships) {
    await ensurePlatformAdminMemberships(userId);
  }

  const { data, error } = await supabase
    .from('epsu_memberships')
    .select('id, epsu_id, role, status, muted_until')
    .eq('profile_id', userId)
    .in('status', ['active', 'muted']);

  if (error) {
    throw error;
  }

  return (data ?? []).map((membership) => ({
    id: membership.id,
    epsuId: membership.epsu_id,
    profileId: userId,
    role: membership.role,
    status: membership.status,
    mutedUntil: membership.muted_until,
  }));
}

export async function fetchHiddenEpsuIds(userId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('epsu_memberships')
    .select('epsu_id')
    .eq('profile_id', userId)
    .eq('status', 'kicked');

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => row.epsu_id);
}

export async function ensureRegionalMemberships(countryCode) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('ensure_regional_memberships', {
    p_country_code: countryCode,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchPendingSchoolEpsus() {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('fetch_pending_school_epsus');

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function fetchRegionalEpsuSuggestions() {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('fetch_pending_regional_epsus');

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function reviewPendingRegionalEpsu(epsuId, status, logoPath = null) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('review_pending_regional_epsu', {
    p_epsu_id: epsuId,
    p_status: status,
    p_logo_path: logoPath,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function reviewRegionalEpsuSuggestion(title, countryCode, status, logoPath = null) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('review_regional_epsu_suggestion', {
    p_title: title,
    p_country_code: countryCode,
    p_status: status,
    p_logo_path: logoPath,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function reviewPendingSchoolEpsu(epsuId, status, logoPath = null) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('review_pending_school_epsu', {
    p_epsu_id: epsuId,
    p_status: status,
    p_logo_path: logoPath,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function leaveEpsu(epsuId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('leave_epsu', {
    p_epsu_id: epsuId,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function kickEpsuMember(epsuId, profileId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('kick_epsu_member', {
    p_epsu_id: epsuId,
    p_profile_id: profileId,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function createSchoolEpsuWithoutOwner({ schoolName, website, countryCode }) {
  const supabase = requireSupabase();
  const normalizedName = schoolName.trim().replace(/\s+/g, ' ');
  const normalizedWebsite = website.trim();
  const normalizedCountryCode = countryCode?.trim().toUpperCase() ?? null;

  if (normalizedName.length < 2 || normalizedName.length > 100) {
    return { ok: false, message: 'School name must be between 2 and 100 characters' };
  }

  if (normalizedWebsite.length < 2 || normalizedWebsite.length > 100) {
    return { ok: false, message: 'Website must be between 2 and 100 characters' };
  }

  if (!normalizedCountryCode || normalizedCountryCode.length !== 2) {
    return { ok: false, message: 'Choose your country before creating a school Epsu' };
  }

  const code =
    normalizedName
      .split(' ')
      .filter(Boolean)
      .map((word) => word[0]?.toUpperCase())
      .join('')
      .slice(0, 3) || 'SCH';

  const { data, error } = await supabase.rpc('create_school_epsu', {
    p_school_name: normalizedName,
    p_code: code,
    p_slug: '',
    p_website: normalizedWebsite,
    p_country_code: normalizedCountryCode,
  });

  if (error) {
    throw error;
  }

  return { ok: true, epsu: data };
}
