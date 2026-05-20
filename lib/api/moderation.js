import { requireSupabase } from '../supabase';

export async function fetchBackgroundJobHealth() {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('fetch_background_job_health');

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    jobName: row.job_name,
    schedule: row.schedule,
    lastRunStartedAt: row.last_run_started_at,
    lastRunFinishedAt: row.last_run_finished_at,
    lastRunStatus: row.last_run_status,
    isHealthy: Boolean(row.is_healthy),
  }));
}

export async function fetchModeratorStats(epsuId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('moderation_actions')
    .select('actor_profile_id, action_type, profiles!moderation_actions_actor_profile_id_fkey(email)')
    .eq('epsu_id', epsuId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  const grouped = new Map();

  (data ?? []).forEach((row) => {
    const existing = grouped.get(row.actor_profile_id) ?? {
      profileId: row.actor_profile_id,
      email: row.profiles?.email ?? 'Unknown admin',
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

export async function fetchModerationRecords(epsuId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('moderation_actions')
    .select(
      'id, actor_profile_id, target_profile_id, post_id, action_type, details, created_at, actor_profile:profiles!moderation_actions_actor_profile_id_fkey(email), target_profile:profiles!moderation_actions_target_profile_id_fkey(email)'
    )
    .eq('epsu_id', epsuId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    actorProfileId: row.actor_profile_id,
    targetProfileId: row.target_profile_id,
    postId: row.post_id,
    actionType: row.action_type,
    details: row.details ?? {},
    createdAt: row.created_at,
    actorEmail: row.actor_profile?.email ?? 'Unknown admin',
    targetEmail: row.target_profile?.email ?? null,
  }));
}

export async function fetchWorstUsers(epsuId) {
  const supabase = requireSupabase();
  const [{ data: memberships, error: membershipsError }, { data: actions, error: actionsError }] = await Promise.all([
    supabase
      .from('epsu_memberships')
      .select('profile_id')
      .eq('epsu_id', epsuId)
      .in('status', ['active', 'muted']),
    supabase
      .from('moderation_actions')
      .select('target_profile_id, action_type')
      .eq('epsu_id', epsuId)
      .in('action_type', ['remove_post', 'mute_author_24h'])
      .not('target_profile_id', 'is', null),
  ]);

  if (membershipsError) {
    throw membershipsError;
  }

  if (actionsError) {
    throw actionsError;
  }

  const activeProfileIds = new Set((memberships ?? []).map((membership) => membership.profile_id).filter(Boolean));
  const grouped = new Map();

  (actions ?? []).forEach((row) => {
    const profileId = row.target_profile_id ?? null;
    if (!profileId || !activeProfileIds.has(profileId)) {
      return;
    }

    const existing = grouped.get(profileId) ?? {
      authorId: profileId,
      removedPostCount: 0,
      muted24hCount: 0,
    };

    if (row.action_type === 'remove_post') {
      existing.removedPostCount += 1;
    } else if (row.action_type === 'mute_author_24h') {
      existing.muted24hCount += 1;
    }

    grouped.set(profileId, existing);
  });

  return Array.from(grouped.entries())
    .map(([, stats]) => ({
      ...stats,
      totalScore: stats.removedPostCount + stats.muted24hCount,
    }))
    .filter((entry) => entry.totalScore > 0)
    .sort((left, right) => {
      if (right.totalScore !== left.totalScore) {
        return right.totalScore - left.totalScore;
      }

      if (right.removedPostCount !== left.removedPostCount) {
        return right.removedPostCount - left.removedPostCount;
      }

      return right.muted24hCount - left.muted24hCount;
    })
    .slice(0, 10)
    .map((entry, index) => ({
      ...entry,
      label: `User ${index + 1}`,
    }));
}

export async function fetchOpenReportsForEpsu(epsuId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('post_reports')
    .select('id, status, created_at, reason, post_id, posts!inner(id, epsu_id, number, title, body, author_id)')
    .eq('status', 'open')
    .eq('posts.epsu_id', epsuId)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((report) => ({
    id: report.id,
    status: report.status,
    createdAt: report.created_at,
    reason: report.reason ?? null,
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

export async function fetchFlaggedQueuedPostsForEpsu(epsuId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('fetch_flagged_queued_posts', {
    p_epsu_id: epsuId,
  });

  if (error) {
    throw error;
  }

  return (data ?? []).map((post) => ({
    id: post.id,
    epsuId: post.epsu_id,
    number: post.number,
    title: post.title,
    body: post.body,
    authorId: post.author_id,
    replyToPostId: post.reply_to_post_id,
    flaggedKeywords: post.flagged_keywords ?? [],
    releaseAt: post.release_at,
    createdAt: post.created_at,
  }));
}

export async function fetchMutedAuthorIdsForEpsu(epsuId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('fetch_muted_epsu_member_ids', {
    p_epsu_id: epsuId,
  });

  if (error) {
    throw error;
  }

  return (data ?? [])
    .map((row) => row.profile_id ?? null)
    .filter(Boolean);
}

export async function fetchAllQueuedPosts() {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('fetch_all_queued_posts');

  if (error) {
    throw error;
  }

  return (data ?? []).map((post) => ({
    id: post.id,
    epsuId: post.epsu_id,
    epsuName: post.epsu_name,
    number: post.number,
    title: post.title,
    body: post.body,
    authorId: post.author_id,
    replyToPostId: post.reply_to_post_id,
    releaseAt: post.release_at,
    createdAt: post.created_at,
    keywordReviewedAt: post.keyword_reviewed_at,
    flaggedKeywords: post.flagged_keywords ?? [],
  }));
}

export async function markQueuedPostReviewed(postId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('mark_queued_post_reviewed', {
    p_post_id: postId,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function dismissReport(postId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('dismiss_epsu_report', {
    p_post_id: postId,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function removeReportedPost(postId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('remove_epsu_post', {
    p_post_id: postId,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function muteReportedAuthor(profileId, epsuId, postId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('mute_epsu_member', {
    p_profile_id: profileId,
    p_epsu_id: epsuId,
    p_post_id: postId,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function updateMembershipRole(membershipId, role) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('set_epsu_membership_role', {
    p_membership_id: membershipId,
    p_role: role,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteEpsu(epsuId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('delete_hosted_epsu', {
    p_epsu_id: epsuId,
  });

  if (error) {
    throw error;
  }

  return data;
}
