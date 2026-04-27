import { requireSupabase } from './supabase';

export async function fetchEpsusWithCountry() {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('epsus')
    .select('id, slug, name, code, scope, website, review_status, country_code, logo_path')
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function fetchVisibleMemberships(userId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('epsu_memberships')
    .select('id, epsu_id, role, status, muted_until')
    .eq('profile_id', userId)
    .in('status', ['active', 'muted', 'invited']);

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

export async function submitSchoolApplication({ epsuId, answer }) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('apply_to_school_epsu', {
    p_epsu_id: epsuId,
    p_answer: answer,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchPendingSchoolApplications(epsuId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('epsu_join_applications')
    .select('id, answer, status, created_at, profile_id, profiles!epsu_join_applications_profile_id_fkey(email)')
    .eq('epsu_id', epsuId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((application) => ({
    id: application.id,
    answer: application.answer,
    status: application.status,
    createdAt: application.created_at,
    profileId: application.profile_id,
    email: application.profiles?.email ?? null,
  }));
}

export async function reviewSchoolApplication(applicationId, status) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('review_school_application', {
    p_application_id: applicationId,
    p_status: status,
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
  const { data, error } = await supabase.rpc('fetch_regional_epsu_suggestions');

  if (error) {
    throw error;
  }

  return data ?? [];
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

export async function leaveSchoolEpsu(epsuId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('leave_school_epsu', {
    p_epsu_id: epsuId,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function kickSchoolMember(epsuId, profileId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('kick_school_epsu_member', {
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

  if (!normalizedCountryCode || normalizedCountryCode.length !== 2) {
    return { ok: false, message: 'Choose your country before creating a school Epsu' };
  }

  const slug = `${normalizedName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}-epsu`;
  const code =
    normalizedName
      .split(' ')
      .filter(Boolean)
      .map((word) => word[0]?.toUpperCase())
      .join('')
      .slice(0, 3) || 'SCH';

  const { data: existingBySlug, error: existingError } = await supabase
    .from('epsus')
    .select('id, name')
    .eq('slug', slug)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existingBySlug) {
    return { ok: false, message: `${existingBySlug.name} already exists.` };
  }

  const { data, error } = await supabase.rpc('create_school_epsu', {
    p_school_name: normalizedName,
    p_code: code,
    p_slug: slug,
    p_website: normalizedWebsite,
    p_country_code: normalizedCountryCode,
  });

  if (error) {
    throw error;
  }

  return { ok: true, epsu: data };
}
