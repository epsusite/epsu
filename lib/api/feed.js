import { requireSupabase } from '../supabase';

const DEFAULT_FEED_POST_LIMIT = 250;
const DEFAULT_EPSU_FEED_PAGE_SIZE = 60;

function normalizeFeedLimit(limit) {
  if (!Number.isFinite(limit)) {
    return DEFAULT_FEED_POST_LIMIT;
  }

  return Math.max(1, Math.min(500, Math.floor(limit)));
}

function mapPostRecord(post) {
  return {
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
  };
}

function normalizeFeedOffset(offset) {
  if (!Number.isFinite(offset)) {
    return 0;
  }

  return Math.max(0, Math.floor(offset));
}

export async function fetchPosts(epsuIds = null, options = {}) {
  const supabase = requireSupabase();
  const normalizedEpsuIds = Array.isArray(epsuIds)
    ? epsuIds.filter(Boolean)
    : null;
  const feedLimit = normalizeFeedLimit(options.limit);

  if (normalizedEpsuIds && normalizedEpsuIds.length === 0) {
    return [];
  }

  let query = supabase
    .from('posts')
    .select('id, epsu_id, author_id, number, title, body, like_count, dislike_count, status, reply_to_post_id, release_at, expire_at')
    .eq('status', 'active')
    .order('release_at', { ascending: false })
    .order('number', { ascending: false })
    .range(0, feedLimit - 1);

  if (normalizedEpsuIds) {
    query = query.in('epsu_id', normalizedEpsuIds);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []).slice().reverse().map(mapPostRecord);
}

export async function fetchGuestPosts(epsuIds = null, options = {}) {
  const supabase = requireSupabase();
  const normalizedEpsuIds = Array.isArray(epsuIds)
    ? epsuIds.filter(Boolean)
    : null;
  const feedLimit = normalizeFeedLimit(options.limit);

  const { data, error } = await supabase
    .rpc('fetch_guest_posts', {
      p_epsu_ids: normalizedEpsuIds,
    })
    .order('release_at', { ascending: false })
    .order('number', { ascending: false })
    .range(0, feedLimit - 1);

  if (error) {
    throw error;
  }

  return (data ?? []).slice().reverse().map(mapPostRecord);
}

export async function fetchEpsuFeedPage(epsuId, options = {}) {
  const supabase = requireSupabase();
  const pageLimit = normalizeFeedLimit(options.limit ?? DEFAULT_EPSU_FEED_PAGE_SIZE);
  const pageOffset = normalizeFeedOffset(options.offset);

  const { data, error } = await supabase
    .from('posts')
    .select('id, epsu_id, author_id, number, title, body, like_count, dislike_count, status, reply_to_post_id, release_at, expire_at')
    .eq('status', 'active')
    .eq('epsu_id', epsuId)
    .order('release_at', { ascending: true })
    .order('number', { ascending: true })
    .range(pageOffset, pageOffset + pageLimit - 1);

  if (error) {
    throw error;
  }

  const nextPosts = (data ?? []).map(mapPostRecord);

  return {
    posts: nextPosts,
    hasMore: nextPosts.length === pageLimit,
    nextOffset: pageOffset + nextPosts.length,
  };
}

export async function fetchGuestEpsuFeedPage(epsuId, options = {}) {
  const supabase = requireSupabase();
  const pageLimit = normalizeFeedLimit(options.limit ?? DEFAULT_EPSU_FEED_PAGE_SIZE);
  const pageOffset = normalizeFeedOffset(options.offset);

  const { data, error } = await supabase
    .rpc('fetch_guest_posts', {
      p_epsu_ids: [epsuId],
    })
    .order('release_at', { ascending: true })
    .order('number', { ascending: true })
    .range(pageOffset, pageOffset + pageLimit - 1);

  if (error) {
    throw error;
  }

  const nextPosts = (data ?? []).map(mapPostRecord);

  return {
    posts: nextPosts,
    hasMore: nextPosts.length === pageLimit,
    nextOffset: pageOffset + nextPosts.length,
  };
}

export async function fetchPostById(postId, epsuId = null) {
  const supabase = requireSupabase();

  let query = supabase
    .from('posts')
    .select('id, epsu_id, author_id, number, title, body, like_count, dislike_count, status, reply_to_post_id, release_at, expire_at')
    .eq('id', postId)
    .eq('status', 'active');

  if (epsuId) {
    query = query.eq('epsu_id', epsuId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapPostRecord(data) : null;
}

export async function fetchGuestPostById(postId, epsuId = null) {
  const supabase = requireSupabase();
  const normalizedEpsuIds = epsuId ? [epsuId] : null;

  const { data, error } = await supabase
    .rpc('fetch_guest_posts', {
      p_epsu_ids: normalizedEpsuIds,
    })
    .eq('id', postId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapPostRecord(data) : null;
}

export async function fetchReviewedPostIdsByEpsu(userId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('post_reactions')
    .select('post_id, posts!inner(epsu_id, status)')
    .eq('profile_id', userId)
    .eq('posts.status', 'active');

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
  const normalizedReason = reason?.trim?.() ?? '';

  if (normalizedReason.length < 2 || normalizedReason.length > 1000) {
    throw new Error('Report reason must be between 2 and 1000 characters');
  }

  const { data, error } = await supabase
    .from('post_reports')
    .insert({
      post_id: postId,
      profile_id: userId,
      reason: normalizedReason,
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
      reason: normalizedReason,
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
