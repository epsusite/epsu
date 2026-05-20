export function addReviewedPostIdByEpsu(current, epsuId, postId) {
  const existingIds = current[epsuId] ?? [];
  if (existingIds.includes(postId)) {
    return current;
  }

  return {
    ...current,
    [epsuId]: [...existingIds, postId],
  };
}

export function removeReviewedPostIdByEpsu(current, epsuId, postId) {
  return {
    ...current,
    [epsuId]: (current[epsuId] ?? []).filter((id) => id !== postId),
  };
}

export function appendPostToList(currentPosts, newPost) {
  return [...currentPosts, newPost];
}

export function removeQueuedFlagByPostId(currentFlags, postId) {
  return currentFlags.filter((post) => post.id !== postId);
}

export function applyReactionResultToPosts(currentPosts, postId, result) {
  return currentPosts.flatMap((post) => {
    if (post.id !== postId) {
      return [post];
    }

    if (result.deleted) {
      return [];
    }

    return [
      {
        ...post,
        likeCount: result.likeCount,
        dislikeCount: result.dislikeCount,
      },
    ];
  });
}

export function addReportedPostId(currentIds, postId) {
  return currentIds.includes(postId) ? currentIds : [...currentIds, postId];
}

export function addReplyTargetPostId(currentIds, postId) {
  if (!postId) {
    return currentIds;
  }

  return currentIds.includes(postId) ? currentIds : [...currentIds, postId];
}

export function deriveReplyTargetPostIds(posts, authorId) {
  if (!authorId) {
    return [];
  }

  return Array.from(
    new Set(
      (posts ?? [])
        .filter((post) => post?.authorId === authorId && post?.replyToPostId)
        .map((post) => post.replyToPostId)
    )
  );
}

export function appendReportRecord(currentReports, { reportResult, reportedPost }) {
  if (!reportedPost) {
    return currentReports;
  }

  return [
    ...currentReports,
    {
      id: reportResult.report?.id ?? `report-${reportedPost.id}-${Date.now()}`,
      status: reportResult.report?.status ?? 'open',
      createdAt: reportResult.report?.createdAt ?? new Date().toISOString(),
      reason: reportResult.report?.reason ?? null,
      post: {
        id: reportedPost.id,
        epsuId: reportedPost.epsuId,
        number: reportedPost.number,
        title: reportedPost.title,
        body: reportedPost.body,
        authorId: reportedPost.authorId ?? null,
      },
    },
  ];
}

export function removeReportByPostId(currentReports, postId) {
  return currentReports.filter((report) => report.post.id !== postId);
}

export function removePostById(currentPosts, postId) {
  return currentPosts.filter((post) => post.id !== postId);
}

export function removeEpsuFromList(currentEpsus, epsuId) {
  return currentEpsus.filter((epsu) => epsu.id !== epsuId);
}

export function removeEpsuPosts(currentPosts, epsuId) {
  return currentPosts.filter((post) => post.epsuId !== epsuId);
}

export function removeEpsuReports(currentReports, epsuId) {
  return currentReports.filter((report) => report.post.epsuId !== epsuId);
}

export function removeEpsuMemberships(currentMemberships, epsuId) {
  return currentMemberships.filter((membership) => membership.epsuId !== epsuId);
}

export function removeEpsuId(currentIds, epsuId) {
  return currentIds.filter((id) => id !== epsuId);
}

export function removeEpsuKey(currentMap, epsuId) {
  if (!currentMap || !(epsuId in currentMap)) {
    return currentMap;
  }

  const nextMap = { ...currentMap };
  delete nextMap[epsuId];
  return nextMap;
}

export function removeReportedPostIdsForEpsu(currentReportedPostIds, currentPosts, epsuId) {
  const deletedPostIds = new Set(
    currentPosts.filter((post) => post.epsuId === epsuId).map((post) => post.id)
  );

  if (deletedPostIds.size === 0) {
    return currentReportedPostIds;
  }

  return currentReportedPostIds.filter((postId) => !deletedPostIds.has(postId));
}

export function removeQueuedFlagsForEpsu(currentFlags, epsuId) {
  return currentFlags.filter((post) => post.epsuId !== epsuId);
}

export function upsertApprovedEpsu(currentEpsus, nextEpsu) {
  if (currentEpsus.some((epsu) => epsu.id === nextEpsu.id)) {
    return currentEpsus;
  }

  return [...currentEpsus, nextEpsu];
}

export function appendHostMembership(currentMemberships, hostMembership, email) {
  if (!hostMembership || currentMemberships.some((membership) => membership.id === hostMembership.id)) {
    return currentMemberships;
  }

  return [
    ...currentMemberships,
    {
      ...hostMembership,
      email,
    },
  ];
}

export function mergeSyntheticMemberships(currentMemberships, epsus, profileId, options = {}) {
  if (!profileId) {
    return currentMemberships ?? [];
  }

  const {
    role = 'member',
    status = 'active',
    email = null,
    idPrefix = 'synthetic-membership',
  } = options;

  const existingEpsuIds = new Set((currentMemberships ?? []).map((membership) => membership.epsuId));
  const nextMemberships = [...(currentMemberships ?? [])];

  (epsus ?? []).forEach((epsu) => {
    if (!epsu?.id || existingEpsuIds.has(epsu.id)) {
      return;
    }

    nextMemberships.push({
      id: `${idPrefix}:${profileId}:${epsu.id}`,
      epsuId: epsu.id,
      profileId,
      role,
      status,
      mutedUntil: null,
      ...(email ? { email } : {}),
    });
  });

  return nextMemberships;
}
