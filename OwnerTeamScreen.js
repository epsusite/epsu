import React, { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showAppDialog } from './components/AppDialog';

function getDisplayedRole({ item, currentUserId, currentIsAdmin, currentUserIsHostAnywhere }) {
  if (item.profileId === currentUserId && currentIsAdmin) {
    return 'Administrator';
  }

  if (item.profileId === currentUserId && currentUserIsHostAnywhere) {
    return 'Host';
  }

  if (item.role === 'host') {
    return 'Host';
  }

  return 'Moderator';
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

function MemberRow({ item, canManage, currentUserId, currentIsAdmin, currentUserIsHostAnywhere, onDemote }) {
  const roleLabel = getDisplayedRole({ item, currentUserId, currentIsAdmin, currentUserIsHostAnywhere });
  const canDemote = canManage && item.profileId !== currentUserId && (currentIsAdmin || item.role === 'moderator');
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
          <Text style={styles.memberMeta}>{roleLabel}</Text>
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

  const currentMembership = useMemo(
    () =>
      memberships.find(
        (item) => item.epsuId === epsuId && item.profileId === currentUserId && item.status === 'active'
      ) ?? null,
    [currentUserId, epsuId, memberships]
  );
  const canManageTeam = currentIsAdmin || currentMembership?.role === 'host';
  const currentUserIsHostAnywhere = hostedEpsuIds.length > 0;

  const filteredMemberships = useMemo(
    () => {
      const visibleTeam = memberships
        .filter(
          (item) => item.epsuId === epsuId && item.status === 'active' && ['host', 'moderator'].includes(item.role)
        )
        .slice();

      const alreadyVisible = visibleTeam.some((item) => item.profileId === currentUserId);

      if (currentIsAdmin && currentUserId && !alreadyVisible) {
        visibleTeam.unshift({
          id: `admin-${epsuId}-${currentUserId}`,
          epsuId,
          profileId: currentUserId,
          email: currentEmail ?? 'j.truumaa@gmail.com',
          role: 'moderator',
          status: 'active',
        });
      }

      return visibleTeam.sort((left, right) => {
          const leftRole = getDisplayedRole({
            item: left,
            currentUserId,
            currentIsAdmin,
            currentUserIsHostAnywhere,
          });
          const rightRole = getDisplayedRole({
            item: right,
            currentUserId,
            currentIsAdmin,
            currentUserIsHostAnywhere,
          });
          const roleGap = getRoleRank(rightRole) - getRoleRank(leftRole);

          if (roleGap !== 0) {
            return roleGap;
          }

          return (left.email ?? '').localeCompare(right.email ?? '');
        });
    },
    [currentEmail, currentIsAdmin, currentUserId, currentUserIsHostAnywhere, epsuId, memberships]
  );

  const handleDemote = async (member) => {
    const copy = getDemoteCopy(member);
    const nextRole = getDemoteTargetRole(member);
    const result = await onDemoteModerator(member.id, nextRole);
    showAppDialog('Moderation team', result?.ok ? copy.success : copy.failure);
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
              currentUserIsHostAnywhere={currentUserIsHostAnywhere}
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
    backgroundColor: '#fff8fb',
  },
  content: {
    flex: 1,
    paddingHorizontal: 18,
  },
  sectionEyebrow: {
    fontSize: 13,
    fontWeight: '800',
    color: '#8d6676',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#20131a',
    marginBottom: 18,
  },
  list: {
    gap: 10,
    paddingBottom: 86,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 86,
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#f3d0dd',
    padding: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#20131a',
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 14,
    color: '#7f6170',
    lineHeight: 21,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f3d0dd',
    gap: 12,
  },
  memberIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#fff1f5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  memberBadgeText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#e52b50',
  },
  memberCopy: {
    flex: 1,
  },
  memberTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#211319',
    marginBottom: 2,
  },
  memberMeta: {
    fontSize: 14,
    color: '#7f6170',
  },
  demoteButton: {
    borderRadius: 12,
    backgroundColor: '#e52b50',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  demoteButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 18,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#e52b50',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  fabText: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 32,
  },
});
