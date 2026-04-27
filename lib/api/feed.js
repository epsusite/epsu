import { requireSupabase } from '../supabase';

export async function fetchPosts(epsuIds = null) {
  const supabase = requireSupabase();
  const normalizedEpsuIds = Array.isArray(epsuIds)
    ? epsuIds.filter(Boolean)
    : null;

  if (normalizedEpsuIds && normalizedEpsuIds.length === 0) {
    return [];
  }

  let query = supabase
    .from('posts')
    .select('id, epsu_id, author_id, number, title, body, like_count, dislike_count, status, reply_to_post_id, release_at, expire_at')
    .eq('status', 'active')
    .order('release_at', { ascending: true })
    .order('number', { ascending: true });

  if (normalizedEpsuIds) {
    query = query.in('epsu_id', normalizedEpsuIds);
  }

  const { data, error } = await query;

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
    releaseAt: post.release_at,
    expireAt: post.expire_at,
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

export async function fetchBlockedAuthorIds() {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('fetch_blocked_author_ids');

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function createPost({ epsuId, title, body, replyToPostId = null, flaggedKeywords = [] }) {
  const supabase = requireSupabase();
  const startedAt = Date.now();
  const runCreatePost = async (nextReplyToPostId) =>
    supabase.rpc('create_epsu_post', {
      p_epsu_id: epsuId,
      p_title: title,
      p_body: body,
      p_reply_to_post_id: nextReplyToPostId,
      p_flagged_keywords: flaggedKeywords,
    });

  let { data, error } = await runCreatePost(replyToPostId);

  if (error?.code === '23503' && replyToPostId) {
    console.warn('[post-submit] create_epsu_post retrying without reply target');
    ({ data, error } = await runCreatePost(null));
  }

  if (error) {
    console.warn('[post-submit] create_epsu_post failed', error?.message ?? error);
    console.log(`[post-submit] create_epsu_post finished (${Date.now() - startedAt}ms)`);
    throw error;
  }

  console.log(`[post-submit] create_epsu_post finished (${Date.now() - startedAt}ms)`);

  return data;
}

export async function fetchEpsuPostQuota(epsuId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('fetch_epsu_post_quota', {
    p_epsu_id: epsuId,
  });

  if (error) {
    throw error;
  }

  const quota = Array.isArray(data) ? data[0] : data;

  return {
    postsLeft: quota?.posts_left ?? 0,
    repliesLeft: quota?.replies_left ?? 0,
    resetsAt: quota?.resets_at ?? null,
  };
}

export async function releaseQueuedPosts() {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('release_queued_posts');

  if (error) {
    throw error;
  }

  return data;
}

export async function releaseQueuedPostsNow() {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('release_queued_posts_now');

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteExpiredPosts() {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('delete_expired_posts');

  if (error) {
    throw error;
  }

  return data;
}

export async function reactToPost({ postId, reaction }) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('react_to_post', {
    p_post_id: postId,
    p_reaction: reaction,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function reportPost({ postId, userId, reason }) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('post_reports')
    .insert({
      post_id: postId,
      profile_id: userId,
      reason: reason ?? null,
    })
    .select('id, status, created_at')
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
      status: data.status,
      createdAt: data.created_at,
      reason: reason ?? null,
    },
  };
}

export async function blockPostAuthor(postId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('block_post_author', {
    p_post_id: postId,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function notifyFlaggedPostToModerators({ postId, epsuId, keywords }) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('notify_flagged_post_to_moderators', {
    p_post_id: postId,
    p_epsu_id: epsuId,
    p_keywords: keywords,
  });

  if (error) {
    throw error;
  }

  return data;
}
