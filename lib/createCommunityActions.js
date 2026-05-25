import {
  addReportedPostId,
  addReplyTargetPostId,
  addReviewedPostIdByEpsu,
  appendHostMembership,
  appendReportRecord,
  applyReactionResultToPosts,
  removeEpsuFromList,
  removeEpsuKey,
  removeEpsuId,
  removeEpsuMemberships,
  removeEpsuPosts,
  removeQueuedFlagsForEpsu,
  removeReportedPostIdsForEpsu,
  removeEpsuReports,
  removePostById,
  removeQueuedFlagByPostId,
  removeReportByPostId,
  removeReviewedPostIdByEpsu,
  upsertApprovedEpsu,
} from './appStateTransforms';
import {
  blockPostAuthor,
  createPost,
  deleteExpiredPosts,
  fetchEpsuFeedPage,
  fetchPostById,
  fetchPosts,
  releaseQueuedPosts,
  releaseQueuedPostsNow,
  reactToPost,
  reportPost,
} from './api/feed';
import {
  deleteEpsu,
  dismissReport,
  fetchFlaggedQueuedPostsForEpsu,
  markQueuedPostReviewed,
  muteReportedAuthor,
  removeReportedPost,
  updateMembershipRole,
} from './api/moderation';
import {
  createRegionalEpsu,
  ensureInvite,
  fetchInviteStatus,
  fetchEpsuActivePostCounts,
  fetchEpsuPopulationCounts,
  fetchModeratedEpsuIds,
  fetchHostedEpsuIds,
  joinPublicEpsu,
} from './api/epsus';
import {
  createSchoolEpsuWithoutOwner,
  fetchEpsusWithCountry,
  fetchVisibleMemberships,
  kickEpsuMember,
  leaveEpsu,
  reviewPendingRegionalEpsu,
  reviewPendingSchoolEpsu,
} from './schoolApi';
import { deleteSchoolLogo, uploadSchoolLogo } from './schoolLogo';
import { ensureOnlineOrThrow, ensureOnlinePopup, ensureOnlineResult } from './networkGuard';

export function createCommunityActions({
  supabase,
  epsus,
  posts,
  currentEmail,
  currentCountryCode,
  currentIsAdmin = false,
  userMemberships,
  moderatedEpsuIds,
  setPosts,
  setReviewedPostIdsByEpsu,
  setReportedPostIds,
  setRepliedToPostIds,
  setReports,
  setMemberships,
  setUserMemberships,
  setHostedEpsuIds,
  setModeratedEpsuIds,
  setEpsus,
  setEpsuPopulationById,
  setHiddenEpsuIds,
  setQueuedFlaggedPosts,
  setBlockedAuthorIds,
  setActivePostCountByEpsu,
}) {
  const logCommunityApproval = (message, details = null) => {
    if (details == null) {
      console.log(`[community-approval] ${message}`);
      return;
    }

    try {
      console.log(`[community-approval] ${message}`, details);
    } catch {
      console.log(`[community-approval] ${message}`);
    }
  };

  const refreshUserMembershipsForUser = async (userId) => {
    const nextMemberships = await fetchVisibleMemberships(userId, { ensureAdminMemberships: currentIsAdmin });
    setUserMemberships(nextMemberships);
    return nextMemberships;
  };

  const refreshMembershipRolesForUser = async (userId) => {
    const [nextMemberships, nextHostedEpsuIds, nextModeratedEpsuIds] = await Promise.all([
      fetchVisibleMemberships(userId, { ensureAdminMemberships: currentIsAdmin }),
      fetchHostedEpsuIds(userId),
      fetchModeratedEpsuIds(userId),
    ]);

    setUserMemberships(nextMemberships);
    setHostedEpsuIds(nextHostedEpsuIds);
    setModeratedEpsuIds(nextModeratedEpsuIds);

    return {
      memberships: nextMemberships,
      hostedEpsuIds: nextHostedEpsuIds,
      moderatedEpsuIds: nextModeratedEpsuIds,
    };
  };

  const refreshEpsuCatalogAndPopulation = async () => {
    const refreshedEpsus = await fetchEpsusWithCountry();
    setEpsus(refreshedEpsus);

    try {
      setEpsuPopulationById(
        await fetchEpsuPopulationCounts(refreshedEpsus.map((epsu) => epsu.id))
      );
    } catch {
      setEpsuPopulationById({});
    }

    return refreshedEpsus;
  };

  const submitPostToBackend = async ({ epsuId, title, body, replyToPostId, flaggedKeywords = [] }) =>
    createPost({
      epsuId,
      title,
      body,
      replyToPostId,
      flaggedKeywords,
    });

  const refreshQueuedFlaggedPostsForUser = async (userId) => {
    const nextModeratedEpsuIds = await fetchModeratedEpsuIds(userId);
    const flaggedPosts = await Promise.all(
      nextModeratedEpsuIds.map((epsuId) => fetchFlaggedQueuedPostsForEpsu(epsuId).catch(() => []))
    );
    setQueuedFlaggedPosts(flaggedPosts.flat());
  };

  const handleSubmitPost = async ({ epsuId, title, body, replyToPostId = null, flaggedKeywords = [] }) => {
    await ensureOnlineOrThrow();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('You are no longer signed in. Log in again and try posting');
    }

    const newPost = await submitPostToBackend({
      epsuId,
      title,
      body,
      replyToPostId,
      flaggedKeywords,
    });

    if (replyToPostId) {
      setRepliedToPostIds((current) => addReplyTargetPostId(current, replyToPostId));
    }

    return newPost;
  };

  const handleReactToPost = async (epsuId, postId, reaction) => {
    if (!(await ensureOnlinePopup())) {
      return { ok: false };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false };
    }

    setReviewedPostIdsByEpsu((current) => addReviewedPostIdByEpsu(current, epsuId, postId));

    try {
      const result = await reactToPost({
        postId,
        reaction,
      });

      if (result.duplicate) {
        return { ok: true, duplicate: true };
      }

      setPosts((currentPosts) => applyReactionResultToPosts(currentPosts, postId, result));
      return { ok: true };
    } catch {
      setReviewedPostIdsByEpsu((current) => removeReviewedPostIdByEpsu(current, epsuId, postId));
      return { ok: false };
    }
  };

  const handleReportPost = async ({ postId, reason }) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    const normalizedReason = reason?.trim?.() ?? '';
    if (normalizedReason.length < 2 || normalizedReason.length > 1000) {
      return {
        ok: false,
        message: 'Report reason must be between 2 and 1000 characters',
      };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false };
    }

    try {
      const result = await reportPost({
        postId,
        userId: user.id,
        reason: normalizedReason,
      });

      if (result.duplicate) {
        setReportedPostIds((current) => addReportedPostId(current, postId));
        return { ok: false, duplicate: true };
      }

      const reportedPost = posts.find((post) => post.id === postId);
      if (reportedPost) {
        setReportedPostIds((current) => addReportedPostId(current, postId));
        setReports((current) =>
          appendReportRecord(current, {
            reportResult: result,
            reportedPost,
          })
        );
      }

      return { ok: true };
    } catch (error) {
      return { ok: false, message: error?.message ?? 'Could not delete this Epsu' };
    }
  };

  const handleBlockPostAuthor = async (postId) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    try {
      const result = await blockPostAuthor(postId);
      const blockedAuthorId = result?.blockedAuthorId ?? null;

      if (blockedAuthorId) {
        setBlockedAuthorIds((current) =>
          current.includes(blockedAuthorId) ? current : [...current, blockedAuthorId]
        );
        setPosts((current) => current.filter((post) => post.authorId !== blockedAuthorId));
        setReports((current) => current.filter((report) => report.post.authorId !== blockedAuthorId));
      }

      return result;
    } catch (error) {
      return {
        ok: false,
        message: error?.message ?? 'Could not block this author',
      };
    }
  };

  const handleDismissReport = async (postId) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    try {
      const result = await dismissReport(postId);
      setReports((current) => removeReportByPostId(current, postId));
      return result;
    } catch (error) {
      return {
        ok: false,
        message: error?.message ?? 'Could not dismiss this report',
      };
    }
  };

  const handleDismissQueuedPost = async (postId) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    try {
      const result = await markQueuedPostReviewed(postId);
      setQueuedFlaggedPosts((current) => removeQueuedFlagByPostId(current, postId));
      return result;
    } catch (error) {
      return {
        ok: false,
        message: error?.message ?? 'Could not dismiss this queued post',
      };
    }
  };

  const handleRemoveReportedPost = async (postId, reason = null, notifyAuthor = true) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    try {
      const result = await removeReportedPost(postId, reason, notifyAuthor);
      setPosts((current) => removePostById(current, postId));
      return result;
    } catch (error) {
      return {
        ok: false,
        message: error?.message ?? 'Could not remove this post',
      };
    }
  };

  const handleMuteReportedAuthor = async (postId, profileId, epsuId, reason = null) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    try {
      const result = await muteReportedAuthor(profileId, epsuId, postId, reason);
      return result;
    } catch (error) {
      return {
        ok: false,
        message: error?.message ?? 'Could not mute this author',
      };
    }
  };

  const handleDemoteModerator = async (membershipId, nextRole = 'member') => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    try {
      const result = await updateMembershipRole(membershipId, nextRole);
      setMemberships((current) =>
        current.map((membership) =>
          membership.id === membershipId ? { ...membership, role: nextRole } : membership
        )
      );
      setUserMemberships((current) =>
        current.map((membership) =>
          membership.id === membershipId ? { ...membership, role: nextRole } : membership
        )
      );
      return result;
    } catch {
      return { ok: false };
    }
  };

  const handleKickEpsuMember = async (epsuId, profileId) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    try {
      const result = await kickEpsuMember(epsuId, profileId);
      setMemberships((current) =>
        current.filter(
          (membership) => !(membership.epsuId === epsuId && membership.profileId === profileId)
        )
      );
      setUserMemberships((current) =>
        current.filter(
          (membership) => !(membership.epsuId === epsuId && membership.profileId === profileId)
        )
      );
      return result;
    } catch {
      return { ok: false };
    }
  };

  const handleDeleteEpsu = async (epsuId) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    try {
      const targetEpsu = epsus.find((epsu) => epsu.id === epsuId) ?? null;
      if (targetEpsu?.logo_path) {
        await deleteSchoolLogo(targetEpsu.logo_path).catch(() => {});
      }

      const result = await deleteEpsu(epsuId);
      setEpsus((current) => removeEpsuFromList(current, epsuId));
      setPosts((current) => removeEpsuPosts(current, epsuId));
      setReviewedPostIdsByEpsu((current) => removeEpsuKey(current, epsuId));
      setReportedPostIds((current) => removeReportedPostIdsForEpsu(current, posts, epsuId));
      setReports((current) => removeEpsuReports(current, epsuId));
      setMemberships((current) => removeEpsuMemberships(current, epsuId));
      setModeratedEpsuIds((current) => removeEpsuId(current, epsuId));
      setHostedEpsuIds((current) => removeEpsuId(current, epsuId));
      setUserMemberships((current) => removeEpsuMemberships(current, epsuId));
      setHiddenEpsuIds((current) => removeEpsuId(current, epsuId));
      setEpsuPopulationById((current) => removeEpsuKey(current, epsuId));
      setQueuedFlaggedPosts((current) => removeQueuedFlagsForEpsu(current, epsuId));
      return result;
    } catch {
      return { ok: false };
    }
  };

  const handleEnsureInvite = async (epsuId, inviteRole, options = {}) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, message: 'You must be logged in to generate a QR' };
    }

    try {
      const invite = await ensureInvite({
        epsuId,
        inviteRole,
        forceNew: options.forceNew === true,
      });

      return invite?.token
        ? { ok: true, ...invite }
        : { ok: false, message: 'No QR token was returned' };
    } catch (error) {
      return { ok: false, message: error?.message ?? 'Could not generate QR' };
    }
  };

  const handleFetchInviteStatus = async (epsuId, inviteRole) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, message: 'You must be logged in to view this QR' };
    }

    try {
      const invite = await fetchInviteStatus({
        epsuId,
        inviteRole,
      });

      return invite?.ok === false ? invite : { ok: true, ...(invite ?? {}) };
    } catch (error) {
      return { ok: false, message: error?.message ?? 'Could not load QR status' };
    }
  };

  const handleSubmitEpsuSuggestion = async ({ title, countryCode }) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, message: 'You must be logged in to suggest a new Epsu' };
    }

    try {
      return await createRegionalEpsu({
        title,
        countryCode,
      });
    } catch (error) {
      return {
        ok: false,
        message: error?.message ?? 'Could not save your Epsu suggestion',
      };
    }
  };

  const handleCreateSchoolEpsu = async ({ schoolName, website }) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, message: 'You must be logged in to add a school' };
    }

    try {
      const result = await createSchoolEpsuWithoutOwner({
        schoolName,
        website,
        countryCode: currentCountryCode,
      });

      if (result.ok) {
        const { memberships: nextMemberships } = await refreshMembershipRolesForUser(user.id);

        if (result.epsu?.review_status === 'approved') {
          setEpsus((current) => upsertApprovedEpsu(current, result.epsu));
          setMemberships((current) => {
            const hostMembership = nextMemberships.find(
              (membership) => membership.epsuId === result.epsu.id && membership.role === 'host'
            );

            return appendHostMembership(current, hostMembership, currentEmail);
          });
        }
      }

      return result;
    } catch (error) {
      return {
        ok: false,
        message: error?.message ?? 'Could not create this school Epsu',
      };
    }
  };

  const handleReviewPendingSchoolEpsu = async (
    epsuId,
    status,
    logoUri = null,
    hostEmail = null,
    options = {}
  ) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      logCommunityApproval('school review blocked offline', {
        epsuId,
        status,
      });
      return offlineResult;
    }

    let logoPath = null;
    try {
      logCommunityApproval('school review start', {
        epsuId,
        status,
        hasLogoUri: Boolean(logoUri),
        hostEmail: hostEmail ?? null,
      });

      if (status === 'approved') {
        if (!logoUri) {
          logCommunityApproval('school review missing logo', { epsuId });
          return { ok: false, message: 'Choose a school logo before approving this school' };
        }

        const targetEpsu = epsus.find((epsu) => epsu.id === epsuId);
        logCommunityApproval('school logo upload start', {
          epsuId,
          slug: targetEpsu?.slug ?? `pending-school-${epsuId}`,
        });
        logoPath = await uploadSchoolLogo({
          slug: targetEpsu?.slug ?? `pending-school-${epsuId}`,
          localUri: logoUri,
        });
        logCommunityApproval('school logo upload success', {
          epsuId,
          logoPath,
        });
      }

      logCommunityApproval('school review rpc start', {
        epsuId,
        status,
        logoPath,
        hostEmail: hostEmail ?? null,
      });
      const normalizedResult = await reviewPendingSchoolEpsu(epsuId, status, logoPath, hostEmail, {
        existingHostEmail: options.existingHostEmail ?? null,
      });
      logCommunityApproval('school review rpc success', {
        epsuId,
        status,
        result: normalizedResult,
      });

      if (normalizedResult?.ok) {
        logCommunityApproval('school review refreshing catalog', { epsuId });
        await refreshEpsuCatalogAndPopulation();
        logCommunityApproval('school review refresh complete', { epsuId });
      }

      return normalizedResult;
    } catch (error) {
      logCommunityApproval('school review failed', {
        epsuId,
        status,
        logoPath,
        message: error?.message ?? 'Could not review this school',
      });
      if (logoPath) {
        await deleteSchoolLogo(logoPath).catch(() => {});
      }
      return {
        ok: false,
        message: error?.message ?? 'Could not review this school',
      };
    }
  };

  const handleReviewRegionalEpsuSuggestion = async (
    epsuId,
    status,
    logoUri = null,
    hostEmail = null,
    options = {}
  ) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      logCommunityApproval('regional review blocked offline', {
        epsuId,
        status,
      });
      return offlineResult;
    }

    let logoPath = null;
    try {
      logCommunityApproval('regional review start', {
        epsuId,
        status,
        hasLogoUri: Boolean(logoUri),
        hostEmail: hostEmail ?? null,
      });

      if (status === 'approved') {
        if (!logoUri) {
          logCommunityApproval('regional review missing logo', { epsuId });
          return { ok: false, message: 'Choose a regional logo before approving this suggestion' };
        }

        logCommunityApproval('regional logo upload start', {
          epsuId,
          slug: `pending-regional-${epsuId}`,
        });
        logoPath = await uploadSchoolLogo({
          slug: `pending-regional-${epsuId}`,
          localUri: logoUri,
        });
        logCommunityApproval('regional logo upload success', {
          epsuId,
          logoPath,
        });
      }

      logCommunityApproval('regional review rpc start', {
        epsuId,
        status,
        logoPath,
        hostEmail: hostEmail ?? null,
        legacyTitle: options.title ?? null,
        legacyCountryCode: options.countryCode ?? null,
      });
      const result = await reviewPendingRegionalEpsu(epsuId, status, logoPath, hostEmail, {
        title: options.title ?? null,
        countryCode: options.countryCode ?? null,
        existingHostEmail: options.existingHostEmail ?? null,
      });
      logCommunityApproval('regional review rpc success', {
        epsuId,
        status,
        result,
      });

      if (result?.ok) {
        logCommunityApproval('regional review refreshing catalog', { epsuId });
        await refreshEpsuCatalogAndPopulation();
        logCommunityApproval('regional review refresh complete', { epsuId });
      }

      return result;
    } catch (error) {
      logCommunityApproval('regional review failed', {
        epsuId,
        status,
        logoPath,
        message: error?.message ?? 'Could not review this suggestion',
      });
      if (logoPath) {
        await deleteSchoolLogo(logoPath).catch(() => {});
      }
      return {
        ok: false,
        message: error?.message ?? 'Could not review this suggestion',
      };
    }
  };

  const handleLeaveEpsu = async (epsuId) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false };
    }

    try {
      const result = await leaveEpsu(epsuId);
      await refreshUserMembershipsForUser(user.id);
      return result;
    } catch {
      return { ok: false };
    }
  };

  const handleJoinEpsu = async (epsuId) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, message: 'You must be logged in to join' };
    }

    try {
      const result = await joinPublicEpsu(epsuId);
      await refreshUserMembershipsForUser(user.id);
      return result?.ok ? result : { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: error?.message ?? 'Could not join this Epsu',
      };
    }
  };

  const handleReleaseQueuedPostsNow = async () => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    try {
      const result = await releaseQueuedPostsNow();
      const activeMembershipEpsuIds = userMemberships
        .filter((membership) => membership.status === 'active' || membership.status === 'muted')
        .map((membership) => membership.epsuId);
      const [nextPosts, nextQueuedFlags, nextActivePostCountByEpsu] = await Promise.all([
        fetchPosts(activeMembershipEpsuIds).catch(() => []),
        Promise.all(
          moderatedEpsuIds.map((epsuId) => fetchFlaggedQueuedPostsForEpsu(epsuId).catch(() => []))
        ).catch(() => []),
        fetchEpsuActivePostCounts(epsus.map((epsu) => epsu.id)).catch(() => ({})),
      ]);

      setPosts(nextPosts);
      setQueuedFlaggedPosts(nextQueuedFlags.flat());
      setActivePostCountByEpsu(nextActivePostCountByEpsu);
      return { ok: true, ...result };
    } catch (error) {
      return { ok: false, message: error?.message ?? 'Could not release queued posts' };
    }
  };

  const handleFetchEpsuFeedPage = async (epsuId, options = {}) => {
    const requestStartedAt = Date.now();
    const offset = options.offset ?? 0;
    console.log('[epsu-feed] action fetch start', {
      epsuId,
      offset,
      limit: options.limit ?? null,
    });

    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      console.log('[epsu-feed] action fetch blocked offline', {
        epsuId,
        offset,
        elapsedMs: Date.now() - requestStartedAt,
        message: offlineResult.message,
      });
      return {
        ok: false,
        message: offlineResult.message,
        posts: [],
        hasMore: false,
        nextOffset: options.offset ?? 0,
      };
    }

    const pendingLogTimeout = setTimeout(() => {
      console.log('[epsu-feed] action fetch still pending', {
        epsuId,
        offset,
        elapsedMs: Date.now() - requestStartedAt,
      });
    }, 10000);

    try {
      const result = await fetchEpsuFeedPage(epsuId, options);
      clearTimeout(pendingLogTimeout);
      console.log('[epsu-feed] action fetch success', {
        epsuId,
        offset,
        postCount: result?.posts?.length ?? 0,
        hasMore: result?.hasMore ?? null,
        nextOffset: result?.nextOffset ?? null,
        elapsedMs: Date.now() - requestStartedAt,
      });
      return { ok: true, ...result };
    } catch (error) {
      clearTimeout(pendingLogTimeout);
      console.log('[epsu-feed] action fetch error', {
        epsuId,
        offset,
        elapsedMs: Date.now() - requestStartedAt,
        message: error?.message ?? 'Could not load more posts',
      });
      return {
        ok: false,
        message: error?.message ?? 'Could not load more posts',
        posts: [],
        hasMore: false,
        nextOffset: options.offset ?? 0,
      };
    }
  };

  const handleFetchPostById = async (postId, epsuId = null) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return {
        ok: false,
        message: offlineResult.message,
        post: null,
      };
    }

    try {
      const post = await fetchPostById(postId, epsuId);
      return { ok: true, post };
    } catch (error) {
      return {
        ok: false,
        message: error?.message ?? 'Could not load reply context',
        post: null,
      };
    }
  };

  return {
    handleSubmitPost,
    handleReactToPost,
    handleReportPost,
    handleBlockPostAuthor,
    handleDismissReport,
    handleDismissQueuedPost,
    handleRemoveReportedPost,
    handleMuteReportedAuthor,
    handleDemoteModerator,
    handleKickEpsuMember,
    handleDeleteEpsu,
    handleEnsureInvite,
    handleFetchInviteStatus,
    handleSubmitEpsuSuggestion,
    handleCreateSchoolEpsu,
    handleReviewPendingSchoolEpsu,
    handleReviewRegionalEpsuSuggestion,
    handleLeaveEpsu,
    handleJoinEpsu,
    handleReleaseQueuedPostsNow,
    handleFetchEpsuFeedPage,
    handleFetchPostById,
    refreshQueuedFlaggedPostsForUser,
    releaseQueuedPosts,
    deleteExpiredPosts,
  };
}
