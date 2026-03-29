import { requireSupabase } from './supabase';

const STATIC_EPSUS = [
  { slug: 'atl-epsu', name: 'ATL Epsu', code: 'ATL' },
  { slug: 'phoenix-epsu', name: 'Phoenix Epsu', code: 'PHX' },
  { slug: 'fort-lauderdale-epsu', name: 'Fort Lauderdale Epsu', code: 'FTL' },
  { slug: 'bismark-epsu', name: 'Bismark Epsu', code: 'BIS' },
  { slug: 'seattle-epsu', name: 'Seattle Epsu', code: 'SEA' },
  { slug: 'reno-epsu', name: 'Reno Epsu', code: 'RNO' },
  { slug: 'birmingham-epsu', name: 'Birningham Epsu', code: 'BHM' },
  { slug: 'el-paso-epsu', name: 'El Paso Epsu', code: 'ELP' },
  { slug: 'nyc-epsu', name: 'NYC Epsu', code: 'NYC' },
  { slug: 'ancourage-epsu', name: 'Ancourage Epsu', code: 'ANC' },
];

export async function syncStaticEpsus() {
  const supabase = requireSupabase();

  const { error } = await supabase.from('epsus').upsert(
    STATIC_EPSUS.map((epsu) => ({
      slug: epsu.slug,
      name: epsu.name,
      code: epsu.code,
      scope: 'city',
    })),
    { onConflict: 'slug' }
  );

  if (error) {
    throw error;
  }
}

export async function fetchEpsus() {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('epsus')
    .select('id, slug, name, code')
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function ensurePrototypeRoles(profileId) {
  const supabase = requireSupabase();
  const desiredRoles = [
    { slug: 'phoenix-epsu', role: 'owner' },
    { slug: 'nyc-epsu', role: 'owner' },
    { slug: 'fort-lauderdale-epsu', role: 'moderator' },
    { slug: 'seattle-epsu', role: 'moderator' },
  ];

  const { data: matchedEpsus, error: epsuError } = await supabase
    .from('epsus')
    .select('id, slug')
    .in(
      'slug',
      desiredRoles.map((item) => item.slug)
    );

  if (epsuError) {
    throw epsuError;
  }

  const rows = desiredRoles
    .map((item) => {
      const epsu = matchedEpsus?.find((candidate) => candidate.slug === item.slug);
      if (!epsu) {
        return null;
      }

      return {
        epsu_id: epsu.id,
        profile_id: profileId,
        role: item.role,
        status: 'active',
      };
    })
    .filter(Boolean);

  if (rows.length === 0) {
    return;
  }

  const { error } = await supabase.from('epsu_memberships').upsert(rows, {
    onConflict: 'epsu_id,profile_id',
  });

  if (error) {
    throw error;
  }
}

export async function fetchPosts() {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('posts')
    .select('id, epsu_id, author_id, number, title, body, like_count, dislike_count, status, reply_to_post_id')
    .eq('status', 'active')
    .order('number', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((post) => ({
    id: post.id,
    epsuId: post.epsu_id,
    authorId: post.author_id,
    number: post.number,
    title: post.title,
    body: post.body,
    likeCount: post.like_count,
    dislikeCount: post.dislike_count,
    replyToPostId: post.reply_to_post_id,
  }));
}

export async function fetchReviewedPostIdsByEpsu(userId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('post_reactions')
    .select('post_id, posts!inner(epsu_id)')
    .eq('profile_id', userId);

  if (error) {
    throw error;
  }

  return (data ?? []).reduce((accumulator, row) => {
    const epsuId = row.posts.epsu_id;
    if (!accumulator[epsuId]) {
      accumulator[epsuId] = [];
    }

    accumulator[epsuId].push(row.post_id);
    return accumulator;
  }, {});
}

export async function fetchReportedPostIds(userId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('post_reports')
    .select('post_id')
    .eq('profile_id', userId);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => row.post_id);
}

export async function fetchModeratedEpsuIds(userId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('epsu_memberships')
    .select('epsu_id, role')
    .eq('profile_id', userId)
    .in('role', ['moderator', 'owner'])
    .eq('status', 'active');

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => row.epsu_id);
}

export async function fetchOwnedEpsuIds(userId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('epsu_memberships')
    .select('epsu_id')
    .eq('profile_id', userId)
    .eq('role', 'owner')
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
    .select('id, epsu_id, role, status, profile_id, profiles(username)')
    .eq('epsu_id', epsuId)
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((membership) => ({
    id: membership.id,
    epsuId: membership.epsu_id,
    role: membership.role,
    profileId: membership.profile_id,
    username: membership.profiles?.username ?? null,
  }));
}

export async function fetchModeratorStats(epsuId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('moderation_actions')
    .select('actor_profile_id, action_type, profiles!moderation_actions_actor_profile_id_fkey(username)')
    .eq('epsu_id', epsuId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  const grouped = new Map();

  (data ?? []).forEach((row) => {
    const existing = grouped.get(row.actor_profile_id) ?? {
      profileId: row.actor_profile_id,
      username: row.profiles?.username ?? 'Unknown mod',
      dismissCount: 0,
      muteCount: 0,
      removeCount: 0,
    };

    if (row.action_type === 'dismiss_report') {
      existing.dismissCount += 1;
    } else if (row.action_type === 'mute_author_24h') {
      existing.muteCount += 1;
    } else if (row.action_type === 'remove_post') {
      existing.removeCount += 1;
    }

    grouped.set(row.actor_profile_id, existing);
  });

  return Array.from(grouped.values()).sort(
    (left, right) =>
      right.removeCount + right.muteCount + right.dismissCount -
      (left.removeCount + left.muteCount + left.dismissCount)
  );
}

export async function fetchWorstUsers(epsuId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('posts')
    .select('author_id')
    .eq('epsu_id', epsuId)
    .eq('status', 'deleted_by_mod');

  if (error) {
    throw error;
  }

  const grouped = new Map();

  (data ?? []).forEach((row) => {
    if (!row.author_id) {
      return;
    }

    grouped.set(row.author_id, (grouped.get(row.author_id) ?? 0) + 1);
  });

  return Array.from(grouped.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([authorId, removedCount], index) => ({
      authorId,
      label: `User ${index + 1}`,
      removedCount,
    }));
}

export async function fetchOpenReportsForEpsu(epsuId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('post_reports')
    .select('id, reason, status, created_at, post_id, posts!inner(id, epsu_id, number, title, body, author_id)')
    .eq('status', 'open')
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? [])
    .filter((report) => report.posts?.epsu_id === epsuId)
    .map((report) => ({
    id: report.id,
    reason: report.reason,
    status: report.status,
    createdAt: report.created_at,
    post: {
      id: report.posts.id,
      epsuId: report.posts.epsu_id,
      number: report.posts.number,
      title: report.posts.title,
      body: report.posts.body,
      authorId: report.posts.author_id,
    },
    }));
}

export async function createPost({ epsuId, title, body, userId, replyToPostId = null }) {
  const supabase = requireSupabase();

  const { data: latestPost, error: latestError } = await supabase
    .from('posts')
    .select('number')
    .eq('epsu_id', epsuId)
    .order('number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    throw latestError;
  }

  const nextNumber = (latestPost?.number ?? 0) + 1;
  const { data, error } = await supabase
    .from('posts')
    .insert({
      epsu_id: epsuId,
      author_id: userId,
      number: nextNumber,
      title,
      body,
      reply_to_post_id: replyToPostId,
    })
    .select('id, epsu_id, author_id, number, title, body, like_count, dislike_count, reply_to_post_id')
    .single();

  if (error) {
    throw error;
  }

  return {
    id: data.id,
    epsuId: data.epsu_id,
    authorId: data.author_id,
    number: data.number,
    title: data.title,
    body: data.body,
    likeCount: data.like_count,
    dislikeCount: data.dislike_count,
    replyToPostId: data.reply_to_post_id,
  };
}

export async function reactToPost({ postId, userId, reaction }) {
  const supabase = requireSupabase();

  const { error: reactionError } = await supabase.from('post_reactions').insert({
    post_id: postId,
    profile_id: userId,
    reaction,
  });

  if (reactionError) {
    if (reactionError.code === '23505') {
      return { duplicate: true };
    }
    throw reactionError;
  }

  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('id, like_count, dislike_count')
    .eq('id', postId)
    .single();

  if (postError) {
    throw postError;
  }

  const likeCount = post.like_count + (reaction === 'like' ? 1 : 0);
  const dislikeCount = post.dislike_count + (reaction === 'dislike' ? 1 : 0);
  const totalReactions = likeCount + dislikeCount;
  const shouldDelete = totalReactions >= 100 && dislikeCount / totalReactions >= 0.6;

  if (shouldDelete) {
    const { error: deleteError } = await supabase
      .from('posts')
      .update({
        like_count: likeCount,
        dislike_count: dislikeCount,
        status: 'deleted_by_threshold',
      })
      .eq('id', postId);

    if (deleteError) {
      throw deleteError;
    }

    return { deleted: true };
  }

  const { error: updateError } = await supabase
    .from('posts')
    .update({
      like_count: likeCount,
      dislike_count: dislikeCount,
    })
    .eq('id', postId);

  if (updateError) {
    throw updateError;
  }

  return {
    deleted: false,
    likeCount,
    dislikeCount,
  };
}

export async function reportPost({ postId, userId, reason = null, explanation = '' }) {
  const supabase = requireSupabase();
  const combinedReason = explanation ? `${reason}\n\n${explanation}` : reason;
  const { data, error } = await supabase
    .from('post_reports')
    .insert({
      post_id: postId,
      profile_id: userId,
      reason: combinedReason,
    })
    .select('id, reason, status, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { duplicate: true };
    }

    throw error;
  }

  return {
    duplicate: false,
    report: {
      id: data.id,
      reason: data.reason,
      status: data.status,
      createdAt: data.created_at,
    },
  };
}

async function logModerationAction({ actorProfileId, epsuId, postId, targetProfileId = null, actionType }) {
  if (!actorProfileId) {
    return;
  }

  const supabase = requireSupabase();
  const { error } = await supabase.from('moderation_actions').insert({
    actor_profile_id: actorProfileId,
    target_profile_id: targetProfileId,
    epsu_id: epsuId,
    post_id: postId,
    action_type: actionType,
  });

  if (error) {
    throw error;
  }
}

export async function dismissReport(postId, actorProfileId, epsuId, targetProfileId = null) {
  const supabase = requireSupabase();
  const { error } = await supabase
    .from('post_reports')
    .update({ status: 'rejected' })
    .eq('post_id', postId)
    .eq('status', 'open');

  if (error) {
    throw error;
  }

  await logModerationAction({
    actorProfileId,
    epsuId,
    postId,
    targetProfileId,
    actionType: 'dismiss_report',
  });

  return { ok: true };
}

export async function removeReportedPost(postId, actorProfileId, epsuId, targetProfileId = null) {
  const supabase = requireSupabase();

  const { error: postError } = await supabase
    .from('posts')
    .update({ status: 'deleted_by_mod' })
    .eq('id', postId);

  if (postError) {
    throw postError;
  }

  const { error: reportError } = await supabase
    .from('post_reports')
    .update({ status: 'resolved' })
    .eq('post_id', postId)
    .eq('status', 'open');

  if (reportError) {
    throw reportError;
  }

  await logModerationAction({
    actorProfileId,
    epsuId,
    postId,
    targetProfileId,
    actionType: 'remove_post',
  });

  return { ok: true };
}

export async function muteReportedAuthor(profileId, epsuId, postId, actorProfileId) {
  const supabase = requireSupabase();
  const muteUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from('epsu_memberships').update({ status: 'muted' }).eq('epsu_id', epsuId).eq('profile_id', profileId);

  if (error) {
    throw error;
  }

  const { error: reportError } = await supabase
    .from('post_reports')
    .update({ status: 'resolved' })
    .eq('post_id', postId)
    .eq('status', 'open');

  if (reportError) {
    throw reportError;
  }

  await logModerationAction({
    actorProfileId,
    epsuId,
    postId,
    targetProfileId: profileId,
    actionType: 'mute_author_24h',
  });

  return { ok: true, muteUntil };
}

export async function updateMembershipRole(membershipId, role) {
  const supabase = requireSupabase();
  const { error } = await supabase
    .from('epsu_memberships')
    .update({ role })
    .eq('id', membershipId);

  if (error) {
    throw error;
  }

  return { ok: true };
}

export async function deleteEpsu(epsuId) {
  const supabase = requireSupabase();
  const { error } = await supabase.from('epsus').delete().eq('id', epsuId);

  if (error) {
    throw error;
  }

  return { ok: true };
}
