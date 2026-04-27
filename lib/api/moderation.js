import { requireSupabase } from '../supabase';

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
  const { data, error } = await supabase
    .from('post_reports')
    .select('post_id, profile_id, posts!inner(epsu_id, author_id)')
    .eq('posts.epsu_id', epsuId);

  if (error) {
    throw error;
  }

  const grouped = new Map();

  (data ?? []).forEach((row) => {
    const authorId = row.posts?.author_id ?? null;
    if (!authorId) {
      return;
    }

    const existing = grouped.get(authorId) ?? {
      totalReports: 0,
      reporterIds: new Set(),
      postIds: new Set(),
    };

    existing.totalReports += 1;
    if (row.profile_id) {
      existing.reporterIds.add(row.profile_id);
    }
    if (row.post_id) {
      existing.postIds.add(row.post_id);
    }

    grouped.set(authorId, existing);
  });

  return Array.from(grouped.entries())
    .map(([authorId, stats]) => ({
      authorId,
      totalReports: stats.totalReports,
      distinctReporterCount: stats.reporterIds.size,
      reportedPostCount: stats.postIds.size,
    }))
    .filter((entry) => entry.reportedPostCount >= 1 && entry.distinctReporterCount >= 2)
    .sort((left, right) => {
      if (right.totalReports !== left.totalReports) {
        return right.totalReports - left.totalReports;
      }

      if (right.distinctReporterCount !== left.distinctReporterCount) {
        return right.distinctReporterCount - left.distinctReporterCount;
      }

      return right.reportedPostCount - left.reportedPostCount;
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
