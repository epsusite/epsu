import React, { useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { fetchModeratorStats } from './lib/epsuApi';

function MemberRow({ item, isOwner, stats, onPromote, onDemote }) {
  const totalActions = (stats?.dismissCount ?? 0) + (stats?.muteCount ?? 0) + (stats?.removeCount ?? 0);

  return (
    <View style={styles.memberRow}>
      <View style={styles.memberCopy}>
        <Text style={styles.memberTitle}>{item.username ?? 'Unknown member'}</Text>
        <Text style={styles.memberMeta}>{item.role}</Text>
        {item.role === 'moderator' ? (
          <Text style={styles.memberStats}>
            {totalActions} actions, {stats?.removeCount ?? 0} removals, {stats?.muteCount ?? 0} mutes
          </Text>
        ) : null}
      </View>
      {isOwner ? null : item.role === 'member' ? (
        <TouchableOpacity style={styles.smallButton} onPress={() => onPromote(item)} activeOpacity={0.85}>
          <Text style={styles.smallButtonText}>Make mod</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.smallButton} onPress={() => onDemote(item)} activeOpacity={0.85}>
          <Text style={styles.smallButtonText}>Remove mod</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function OwnerTeamScreen({
  navigation,
  route,
  epsus,
  memberships,
  onPromoteMember,
  onDemoteModerator,
}) {
  const epsuId = route?.params?.epsuId ?? null;
  const epsu = epsus.find((item) => item.id === epsuId) ?? null;
  const filteredMemberships = memberships.filter((item) => item.epsuId === epsuId);
  const [moderatorStats, setModeratorStats] = useState([]);

  useEffect(() => {
    let isActive = true;

    fetchModeratorStats(epsuId)
      .then((result) => {
        if (isActive) {
          setModeratorStats(result);
        }
      })
      .catch(() => {
        if (isActive) {
          setModeratorStats([]);
        }
      });

    return () => {
      isActive = false;
    };
  }, [epsuId]);

  const statsByProfileId = moderatorStats.reduce((accumulator, item) => {
    accumulator[item.profileId] = item;
    return accumulator;
  }, {});

  const handlePromote = async (member) => {
    const result = await onPromoteMember(member.id);
    Alert.alert('Owner tools', result?.ok ? 'Member promoted to mod.' : 'Could not update role.');
  };

  const handleDemote = async (member) => {
    const result = await onDemoteModerator(member.id);
    Alert.alert('Owner tools', result?.ok ? 'Moderator removed.' : 'Could not update role.');
  };

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.sectionEyebrow}>Moderation team</Text>
        <Text style={styles.sectionTitle}>{epsu?.name ?? 'Epsu'}</Text>

        <FlatList
          data={filteredMemberships}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <MemberRow
              item={item}
              isOwner={item.role === 'owner'}
              stats={statsByProfileId[item.profileId]}
              onPromote={handlePromote}
              onDemote={handleDemote}
            />
          )}
        />

        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate('OwnerModInvite', { epsuId })}
          activeOpacity={0.85}
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
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
    paddingTop: 20,
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
    paddingBottom: 18,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f3d0dd',
  },
  memberCopy: {
    flex: 1,
    paddingRight: 12,
  },
  memberTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#211319',
    marginBottom: 4,
  },
  memberMeta: {
    fontSize: 13,
    color: '#7f6170',
    textTransform: 'capitalize',
  },
  memberStats: {
    marginTop: 6,
    fontSize: 13,
    color: '#8a5e70',
  },
  smallButton: {
    borderRadius: 12,
    backgroundColor: '#e52b50',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  smallButtonText: {
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  fabText: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 32,
  },
});
