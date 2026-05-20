import { requireSupabase } from '../supabase';

const DEFAULT_ACCOUNT_HISTORY_LIMIT = 60;

function formatModerationActionTitle(actionType) {
  if (actionType === 'dismiss_report') {
    return 'Dismissed report';
  }

  if (actionType === 'mute_author_24h') {
    return 'Muted author for 24h';
  }

  if (actionType === 'remove_post') {
    return 'Removed post';
  }

  if (actionType === 'change_member_role') {
    return 'Changed member permission';
  }

  if (actionType === 'change_member_status') {
    return 'Changed membership state';
  }

  if (actionType === 'kick_school_member') {
    return 'Kicked member';
  }

  if (actionType === 'redeem_invite') {
    return 'Accepted invite';
  }

  return actionType;
}

export async function deleteOwnAccount() {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('delete_own_account');

  if (error) {
    throw error;
  }

  return data;
}

export async function purgeExpiredPersonalData() {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('purge_expired_personal_data');

  if (error) {
    throw error;
  }

  return data;
}

function withOptionalHistoryLimit(query, full, limit = DEFAULT_ACCOUNT_HISTORY_LIMIT) {
  if (full) {
    return query;
  }

  return query.range(0, limit - 1);
}

export async function fetchAccountHistory(profileId, options = {}) {
  const supabase = requireSupabase();
  const full = options.full === true;

  const [
    postsQuery,
    reactionsQuery,
    reportsQuery,
    notificationsQuery,
    membershipsQuery,
    suggestionsQuery,
    hostedEpsusQuery,
    moderationActionsQuery,
  ] = await Promise.all([
    withOptionalHistoryLimit(
      supabase
      .from('posts')
      .select('id, epsu_id, number, title, status, created_at', { count: 'exact' })
      .eq('author_id', profileId)
      .order('created_at', { ascending: false }),
      full
    ),
    withOptionalHistoryLimit(
      supabase
      .from('post_reactions')
      .select('id, post_id, reaction, created_at', { count: 'exact' })
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false }),
      full
    ),
    withOptionalHistoryLimit(
      supabase
      .from('post_reports')
      .select('id, post_id, status, created_at', { count: 'exact' })
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false }),
      full
    ),
    withOptionalHistoryLimit(
      supabase
      .from('app_notifications')
      .select('id, kind, title, body, related_epsu_id, created_at, read_at', { count: 'exact' })
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false }),
      full
    ),
    withOptionalHistoryLimit(
      supabase
      .from('epsu_memberships')
      .select('id, epsu_id, role, status, created_at', { count: 'exact' })
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false }),
      full
    ),
    withOptionalHistoryLimit(
      supabase
      .from('epsu_suggestions')
      .select('id, title, country_code, status, created_at', { count: 'exact' })
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false }),
      full
    ),
    withOptionalHistoryLimit(
      supabase
      .from('epsus')
      .select('id, name, slug, scope, created_at', { count: 'exact' })
      .eq('host_id', profileId)
      .order('created_at', { ascending: false }),
      full
    ),
    withOptionalHistoryLimit(
      supabase
      .from('moderation_actions')
      .select('id, epsu_id, post_id, action_type, details, created_at, actor_profile_id, target_profile_id', { count: 'exact' })
      .or(`actor_profile_id.eq.${profileId},target_profile_id.eq.${profileId}`)
      .order('created_at', { ascending: false }),
      full
    ),
  ]);

  const firstError = [
    postsQuery.error,
    reactionsQuery.error,
    reportsQuery.error,
    notificationsQuery.error,
    membershipsQuery.error,
    suggestionsQuery.error,
    hostedEpsusQuery.error,
    moderationActionsQuery.error,
  ].find(Boolean);

  if (firstError) {
    throw firstError;
  }

  const epsuIds = new Set();
  [
    ...(postsQuery.data ?? []).map((item) => item.epsu_id),
    ...(notificationsQuery.data ?? []).map((item) => item.related_epsu_id),
    ...(membershipsQuery.data ?? []).map((item) => item.epsu_id),
    ...(moderationActionsQuery.data ?? []).map((item) => item.epsu_id),
  ]
    .filter(Boolean)
    .forEach((id) => epsuIds.add(id));

  const postIds = new Set();
  [
    ...(reactionsQuery.data ?? []).map((item) => item.post_id),
    ...(reportsQuery.data ?? []).map((item) => item.post_id),
    ...(moderationActionsQuery.data ?? []).map((item) => item.post_id),
  ]
    .filter(Boolean)
    .forEach((id) => postIds.add(id));

  const [epsusQuery, linkedPostsQuery] = await Promise.all([
    epsuIds.size
      ? supabase.from('epsus').select('id, name').in('id', Array.from(epsuIds))
      : Promise.resolve({ data: [], error: null }),
    postIds.size
      ? supabase.from('posts').select('id, number, title').in('id', Array.from(postIds))
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (epsusQuery.error) {
    throw epsusQuery.error;
  }

  if (linkedPostsQuery.error) {
    throw linkedPostsQuery.error;
  }

  const epsuNamesById = new Map((epsusQuery.data ?? []).map((item) => [item.id, item.name]));
  const postMetaById = new Map((linkedPostsQuery.data ?? []).map((item) => [item.id, item]));
  const toEpsuName = (epsuId) => (epsuId ? epsuNamesById.get(epsuId) ?? 'Unknown Epsu' : 'Unknown Epsu');
  const toPostLabel = (postId) => {
    const post = postMetaById.get(postId);
    if (!post) {
      return 'Unknown post';
    }

    return `#${post.number} ${post.title}`;
  };

  return {
    meta: {
      isFullExport: full,
      sectionLimit: full ? null : DEFAULT_ACCOUNT_HISTORY_LIMIT,
    },
    summary: {
      posts: postsQuery.count ?? (postsQuery.data ?? []).length,
      reactions: reactionsQuery.count ?? (reactionsQuery.data ?? []).length,
      reports: reportsQuery.count ?? (reportsQuery.data ?? []).length,
      notifications: notificationsQuery.count ?? (notificationsQuery.data ?? []).length,
      memberships: membershipsQuery.count ?? (membershipsQuery.data ?? []).length,
      suggestions: suggestionsQuery.count ?? (suggestionsQuery.data ?? []).length,
      hostedEpsus: hostedEpsusQuery.count ?? (hostedEpsusQuery.data ?? []).length,
      moderationActions: moderationActionsQuery.count ?? (moderationActionsQuery.data ?? []).length,
    },
    posts: (postsQuery.data ?? []).map((item) => ({
      id: item.id,
      title: `#${item.number} ${item.title}`,
      meta: `${toEpsuName(item.epsu_id)} | ${item.status}`,
      createdAt: item.created_at,
    })),
    reactions: (reactionsQuery.data ?? []).map((item) => ({
      id: item.id,
      title: item.reaction === 'like' ? 'Liked post' : 'Disliked post',
      meta: toPostLabel(item.post_id),
      createdAt: item.created_at,
    })),
    reports: (reportsQuery.data ?? []).map((item) => ({
      id: item.id,
      title: 'Reported post',
      meta: `${toPostLabel(item.post_id)} | ${item.status}`,
      createdAt: item.created_at,
    })),
    notifications: (notificationsQuery.data ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      meta: item.related_epsu_id ? toEpsuName(item.related_epsu_id) : item.kind,
      createdAt: item.created_at,
    })),
    memberships: (membershipsQuery.data ?? []).map((item) => ({
      id: item.id,
      title: toEpsuName(item.epsu_id),
      meta: `${item.role} | ${item.status}`,
      createdAt: item.created_at,
    })),
    suggestions: (suggestionsQuery.data ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      meta: `${item.country_code ?? '??'} | ${item.status}`,
      createdAt: item.created_at,
    })),
    hostedEpsus: (hostedEpsusQuery.data ?? []).map((item) => ({
      id: item.id,
      title: item.name,
      meta: `${item.scope} | ${item.slug}`,
      createdAt: item.created_at,
    })),
    moderationActions: (moderationActionsQuery.data ?? []).map((item) => ({
      id: item.id,
      title: formatModerationActionTitle(item.action_type),
      meta: `${item.actor_profile_id === profileId ? 'by you' : 'about you'} | ${toEpsuName(item.epsu_id)}${item.post_id ? ` | ${toPostLabel(item.post_id)}` : ''}`,
      createdAt: item.created_at,
    })),
  };
}
