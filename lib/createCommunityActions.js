import {
  addReportedPostId,
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
  createEpsuSuggestion,
  ensureInvite,
  fetchEpsuPopulationCounts,
  fetchModeratedEpsuIds,
  fetchHostedEpsuIds,
  joinPublicEpsu,
} from './api/epsus';
import {
  createSchoolEpsuWithoutOwner,
  fetchEpsusWithCountry,
  fetchVisibleMemberships,
  kickSchoolMember,
  leaveSchoolEpsu,
  reviewPendingSchoolEpsu,
  reviewRegionalEpsuSuggestion,
  reviewSchoolApplication,
  submitSchoolApplication,
} from './schoolApi';
import { deleteSchoolLogo, uploadSchoolLogo } from './schoolLogo';
import { ensureOnlineOrThrow, ensureOnlinePopup, ensureOnlineResult } from './networkGuard';

export function createCommunityActions({
  supabase,
  epsus,
  posts,
  currentEmail,
  currentCountryCode,
  userMemberships,
  moderatedEpsuIds,
  setPosts,
  setReviewedPostIdsByEpsu,
  setReportedPostIds,
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
}) {
  const getRegionalSuggestionSlug = (title, countryCode) =>
    `${title
      .trim()
      .replace(/\s+/g, ' ')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')}-${countryCode.trim().toLowerCase()}-epsu`;

  const refreshUserMembershipsForUser = async (userId) => {
    const nextMemberships = await fetchVisibleMemberships(userId);
    setUserMemberships(nextMemberships);
    return nextMemberships;
  };

  const refreshMembershipRolesForUser = async (userId) => {
    const [nextMemberships, nextHostedEpsuIds, nextModeratedEpsuIds] = await Promise.all([
      fetchVisibleMemberships(userId),
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
        reason,
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

  const handleRemoveReportedPost = async (postId) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    try {
      const result = await removeReportedPost(postId);
      setPosts((current) => removePostById(current, postId));
      return result;
    } catch (error) {
      return {
        ok: false,
        message: error?.message ?? 'Could not remove this post',
      };
    }
  };

  const handleMuteReportedAuthor = async (postId, profileId, epsuId) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    try {
      const result = await muteReportedAuthor(profileId, epsuId, postId);
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

  const handleKickSchoolMember = async (epsuId, profileId) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    try {
      const result = await kickSchoolMember(epsuId, profileId);
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

  const handleEnsureInvite = async (epsuId, inviteRole) => {
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
      });

      return invite?.token
        ? { ok: true, ...invite }
        : { ok: false, message: 'No QR token was returned' };
    } catch (error) {
      return { ok: false, message: error?.message ?? 'Could not generate QR' };
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
      return await createEpsuSuggestion({
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

  const handleReviewSchoolApplication = async (applicationId, status) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    try {
      const result = await reviewSchoolApplication(applicationId, status);
      return result;
    } catch {
      return { ok: false };
    }
  };

  const handleReviewPendingSchoolEpsu = async (epsuId, status, logoUri = null) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    let logoPath = null;
    try {
      if (status === 'approved') {
        if (!logoUri) {
          return { ok: false, message: 'Choose a school logo before approving this school' };
        }

        const targetEpsu = epsus.find((epsu) => epsu.id === epsuId);
        logoPath = await uploadSchoolLogo({
          slug: targetEpsu?.slug ?? `pending-school-${epsuId}`,
          localUri: logoUri,
        });
      }

      const result = await reviewPendingSchoolEpsu(epsuId, status, logoPath);

      if (result?.ok) {
        await refreshEpsuCatalogAndPopulation();
      }

      return result;
    } catch (error) {
      if (logoPath) {
        await deleteSchoolLogo(logoPath).catch(() => {});
      }
      return {
        ok: false,
        message: error?.message ?? 'Could not review this school',
      };
    }
  };

  const handleReviewRegionalEpsuSuggestion = async (title, countryCode, status, logoUri = null) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    let logoPath = null;
    try {
      if (status === 'approved') {
        if (!logoUri) {
          return { ok: false, message: 'Choose a regional logo before approving this suggestion' };
        }

        logoPath = await uploadSchoolLogo({
          slug: getRegionalSuggestionSlug(title, countryCode),
          localUri: logoUri,
        });
      }

      const result = await reviewRegionalEpsuSuggestion(title, countryCode, status, logoPath);

      if (result?.ok) {
        await refreshEpsuCatalogAndPopulation();
      }

      return result;
    } catch (error) {
      if (logoPath) {
        await deleteSchoolLogo(logoPath).catch(() => {});
      }
      return {
        ok: false,
        message: error?.message ?? 'Could not review this suggestion',
      };
    }
  };

  const handleSubmitSchoolApplication = async ({ epsuId, answer }) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, message: 'You must be logged in to apply' };
    }

    try {
      const result = await submitSchoolApplication({ epsuId, answer });
      await refreshUserMembershipsForUser(user.id);
      return { ok: Boolean(result?.ok) };
    } catch (error) {
      return { ok: false, message: error?.message ?? 'Could not submit application' };
    }
  };

  const handleLeaveSchoolEpsu = async (epsuId) => {
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
      const result = await leaveSchoolEpsu(epsuId);
      await refreshUserMembershipsForUser(user.id);
      return result;
    } catch {
      return { ok: false };
    }
  };

  const handleJoinRegionalEpsu = async (epsuId) => {
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
      const [nextPosts, nextQueuedFlags] = await Promise.all([
        fetchPosts(activeMembershipEpsuIds).catch(() => []),
        Promise.all(
          moderatedEpsuIds.map((epsuId) => fetchFlaggedQueuedPostsForEpsu(epsuId).catch(() => []))
        ).catch(() => []),
      ]);

      setPosts(nextPosts);
      setQueuedFlaggedPosts(nextQueuedFlags.flat());
      return { ok: true, ...result };
    } catch (error) {
      return { ok: false, message: error?.message ?? 'Could not release queued posts' };
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
    handleKickSchoolMember,
    handleDeleteEpsu,
    handleEnsureInvite,
    handleSubmitEpsuSuggestion,
    handleCreateSchoolEpsu,
    handleReviewSchoolApplication,
    handleReviewPendingSchoolEpsu,
    handleReviewRegionalEpsuSuggestion,
    handleSubmitSchoolApplication,
    handleLeaveSchoolEpsu,
    handleJoinRegionalEpsu,
    handleReleaseQueuedPostsNow,
    refreshQueuedFlaggedPostsForUser,
    releaseQueuedPosts,
    deleteExpiredPosts,
  };
}
