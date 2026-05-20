import React, { useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showAppDialog } from './components/AppDialog';
import { fetchEpsuMemberships } from './lib/api/epsus';
import { requireSupabase } from './lib/supabase';
import { UI } from './lib/uiTheme';

function getDisplayedRole({ item, currentUserId, currentIsAdmin }) {
  if (item.isAdmin || (item.profileId === currentUserId && currentIsAdmin)) {
    return 'Administrator';
  }

  if (item.role === 'host') {
    return 'Host';
  }

  return 'Moderator';
}

function getDisplayedMeta({ item, currentUserId, currentIsAdmin }) {
  const roleLabel = getDisplayedRole({ item, currentUserId, currentIsAdmin });

  if (item.status === 'muted') {
    return `${roleLabel} (Muted)`;
  }

  return roleLabel;
}

function getRoleRank(label) {
  if (label === 'Administrator') {
    return 3;
  }

  if (label === 'Host') {
    return 2;
  }

  return 1;
}

function getDemoteTargetRole(item) {
  if (item.role === 'host') {
    return 'moderator';
  }

  return 'member';
}

function getDemoteCopy(item) {
  if (item.role === 'host') {
    return {
      confirm: 'Demote this host to moderator',
      success: 'Host demoted to moderator',
      failure: 'Could not demote this host',
    };
  }

  return {
    confirm: 'Demote this moderator to member',
    success: 'Moderator demoted to member',
    failure: 'Could not demote this moderator',
  };
}

function MemberRow({ item, canManage, currentUserId, currentIsAdmin, onDemote }) {
  const roleLabel = getDisplayedRole({ item, currentUserId, currentIsAdmin });
  const roleMeta = getDisplayedMeta({ item, currentUserId, currentIsAdmin });
  const canDemote =
    canManage &&
    !item.isAdmin &&
    item.profileId !== currentUserId &&
    (currentIsAdmin || item.role === 'moderator');
  const identityLabel = item.email ?? roleLabel;

  return (
    <View style={styles.memberCard}>
      <View style={styles.memberIdentity}>
        <View style={styles.memberBadge}>
          <Text style={styles.memberBadgeText}>
            {(identityLabel ?? '?').slice(0, 1).toUpperCase()}
          </Text>
        </View>

        <View style={styles.memberCopy}>
          <Text style={styles.memberTitle}>{identityLabel}</Text>
          <Text style={styles.memberMeta}>{roleMeta}</Text>
        </View>
      </View>

      {canDemote ? (
        <TouchableOpacity style={styles.demoteButton} onPress={() => onDemote(item)} activeOpacity={0.85}>
          <Text style={styles.demoteButtonText}>Demote</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function OwnerTeamScreen({
  navigation,
  route,
  epsus,
  memberships,
  currentUserId,
  currentEmail,
  currentIsAdmin = false,
  hostedEpsuIds = [],
  onDemoteModerator,
}) {
  const insets = useSafeAreaInsets();
  const epsuId = route?.params?.epsuId ?? null;
  const epsu = epsus.find((item) => item.id === epsuId) ?? null;
  const [liveMemberships, setLiveMemberships] = React.useState(null);
  const supabase = React.useMemo(() => requireSupabase(), []);

  const sourceMemberships = liveMemberships ?? memberships;

  const loadTeam = React.useCallback(async () => {
    if (!epsuId) {
      setLiveMemberships(null);
      return;
    }

    try {
      const result = await fetchEpsuMemberships(epsuId, { includePlatformAdmins: true });
      setLiveMemberships(result);
    } catch {
      setLiveMemberships(null);
    }
  }, [epsuId]);

  useFocusEffect(
    React.useCallback(() => {
      void loadTeam();
      return undefined;
    }, [loadTeam])
  );

  React.useEffect(() => {
    if (!epsuId) {
      return undefined;
    }

    let refreshTimeoutId = null;
    const scheduleRefresh = () => {
      if (refreshTimeoutId) {
        clearTimeout(refreshTimeoutId);
      }

      refreshTimeoutId = setTimeout(() => {
        refreshTimeoutId = null;
        void loadTeam();
      }, 250);
    };

    const channel = supabase
      .channel(`owner-team:${epsuId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'epsu_memberships',
          filter: `epsu_id=eq.${epsuId}`,
        },
        () => {
          scheduleRefresh();
        }
      )
      .subscribe();

    return () => {
      if (refreshTimeoutId) {
        clearTimeout(refreshTimeoutId);
      }
      void supabase.removeChannel(channel);
    };
  }, [epsuId, loadTeam, supabase]);
  void currentEmail;

  const currentMembership = useMemo(
    () =>
      sourceMemberships.find(
        (item) =>
          item.epsuId === epsuId &&
          item.profileId === currentUserId &&
          ['active', 'muted'].includes(item.status)
      ) ?? null,
    [currentUserId, epsuId, sourceMemberships]
  );
  const canManageTeam = currentIsAdmin || currentMembership?.role === 'host';
  void hostedEpsuIds;

  const filteredMemberships = useMemo(
    () => {
      const visibleTeam = sourceMemberships
        .filter(
          (item) =>
            item.epsuId === epsuId &&
            ['active', 'muted'].includes(item.status) &&
            (item.isAdmin || ['host', 'moderator', 'admin'].includes(item.role))
        )
        .slice();

      return visibleTeam.sort((left, right) => {
          const leftRole = getDisplayedRole({
            item: left,
            currentUserId,
            currentIsAdmin,
          });
          const rightRole = getDisplayedRole({
            item: right,
            currentUserId,
            currentIsAdmin,
          });
          const roleGap = getRoleRank(rightRole) - getRoleRank(leftRole);

          if (roleGap !== 0) {
            return roleGap;
          }

          return (left.email ?? '').localeCompare(right.email ?? '');
        });
    },
    [currentIsAdmin, currentUserId, epsuId, sourceMemberships]
  );

  const handleDemote = async (member) => {
    const copy = getDemoteCopy(member);
    showAppDialog(
      'Moderation team',
      copy.confirm,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Demote',
          style: 'destructive',
          onPress: async () => {
            const nextRole = getDemoteTargetRole(member);
            const result = await onDemoteModerator(member.id, nextRole);
            if (result?.ok) {
              setLiveMemberships((current) =>
                Array.isArray(current)
                  ? current.map((entry) => (entry.id === member.id ? { ...entry, role: nextRole } : entry))
                  : current
              );
            }
            showAppDialog('Moderation team', result?.ok ? copy.success : copy.failure);
          },
        },
      ]
    );
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.content, { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 18) }]}>
        <Text style={styles.sectionEyebrow}>Moderation team</Text>
        <Text style={styles.sectionTitle}>{epsu?.name ?? 'Epsu'}</Text>

        <FlatList
          data={filteredMemberships}
          keyExtractor={(item) => item.id}
          contentContainerStyle={filteredMemberships.length === 0 ? styles.emptyContent : styles.list}
          renderItem={({ item }) => (
            <MemberRow
              item={item}
              canManage={canManageTeam}
              currentUserId={currentUserId}
              currentIsAdmin={currentIsAdmin}
              onDemote={handleDemote}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No moderation team yet</Text>
              <Text style={styles.emptyText}>Add a moderator when this Epsu needs extra help</Text>
            </View>
          }
        />

        {canManageTeam ? (
          <TouchableOpacity
            style={styles.fab}
            onPress={() => navigation.navigate('OwnerModInvite', { epsuId })}
            activeOpacity={0.85}
          >
            <Text style={styles.fabText}>+</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: UI.colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: UI.spacing.screen,
  },
  sectionEyebrow: {
    fontSize: 13,
    fontWeight: '800',
    color: UI.colors.textSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: UI.header.eyebrowGap,
  },
  sectionTitle: {
    fontSize: UI.header.titleSize,
    fontWeight: '900',
    color: UI.colors.text,
    marginBottom: UI.header.sectionGap,
  },
  list: {
    gap: UI.spacing.gap,
    paddingBottom: 86,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 86,
  },
  emptyCard: {
    backgroundColor: UI.colors.surface,
    borderRadius: UI.radius.card,
    borderWidth: 1,
    borderColor: UI.colors.border,
    padding: UI.spacing.card,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: UI.colors.text,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 14,
    color: UI.colors.textMuted,
    lineHeight: 21,
  },
  memberCard: {
    minHeight: UI.browseCard.minHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: UI.colors.surface,
    borderRadius: UI.radius.card,
    padding: UI.spacing.card,
    borderWidth: 1,
    borderColor: UI.colors.border,
    gap: 12,
  },
  memberIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberBadge: {
    width: UI.browseCard.badgeSize,
    height: UI.browseCard.badgeSize,
    borderRadius: UI.browseCard.badgeRadius,
    backgroundColor: UI.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: UI.browseCard.badgeGap,
  },
  memberBadgeText: {
    fontSize: 18,
    fontWeight: '900',
    color: UI.colors.primary,
  },
  memberCopy: {
    flex: 1,
  },
  memberTitle: {
    fontSize: UI.browseCard.titleSize,
    fontWeight: '900',
    color: UI.colors.text,
    marginBottom: 4,
  },
  memberMeta: {
    fontSize: UI.browseCard.metaSize,
    color: UI.colors.textMuted,
    lineHeight: 20,
  },
  demoteButton: {
    minHeight: 46,
    borderRadius: UI.radius.button,
    backgroundColor: UI.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: UI.colors.border,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  demoteButtonText: {
    color: UI.colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  fab: {
    position: 'absolute',
    right: UI.spacing.screen,
    bottom: 18,
    zIndex: 10,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: UI.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  fabText: {
    color: UI.colors.surface,
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 32,
  },
});
