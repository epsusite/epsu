import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function ToolCard({ title, meta, onPress, destructive = false }) {
  return (
    <TouchableOpacity
      style={[styles.toolCard, destructive && styles.toolCardDestructive]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text style={[styles.toolTitle, destructive && styles.toolTitleDestructive]}>{title}</Text>
      <Text style={[styles.toolMeta, destructive && styles.toolMetaDestructive]}>{meta}</Text>
    </TouchableOpacity>
  );
}

export default function OwnerToolsScreen({
  navigation,
  route,
  epsus,
  memberships,
  currentUserId,
  currentIsAdmin = false,
}) {
  const insets = useSafeAreaInsets();
  const epsuId = route?.params?.epsuId ?? null;
  const epsu = epsus.find((item) => item.id === epsuId) ?? null;
  const filteredMemberships = useMemo(
    () => memberships.filter((item) => item.epsuId === epsuId),
    [epsuId, memberships]
  );
  const moderatorCount = useMemo(() => {
    const moderatorProfileIds = new Set(
      filteredMemberships
        .filter((item) => item.status === 'active' && ['host', 'moderator'].includes(item.role))
        .map((item) => item.profileId)
        .filter(Boolean)
    );

    if (currentIsAdmin && currentUserId) {
      moderatorProfileIds.add(currentUserId);
    }

    return moderatorProfileIds.size;
  }, [currentIsAdmin, currentUserId, filteredMemberships]);

  return (
    <View style={styles.screen}>
      <View style={[styles.content, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.sectionEyebrow}>Host tools</Text>
        <Text style={styles.sectionTitle}>{epsu?.name ?? 'Epsu'}</Text>

        <View style={styles.toolList}>
          <ToolCard
            title="Moderation team"
            meta={`${moderatorCount} mods`}
            onPress={() => navigation.navigate('OwnerTeam', { epsuId })}
          />
          <ToolCard
            title="Worst users"
            meta="By reports from different people"
            onPress={() => navigation.navigate('OwnerWorstUsers', { epsuId })}
          />
          <ToolCard
            title="Delete Epsu"
            meta="Permanent and host-only"
            onPress={() => navigation.navigate('DeleteEpsu', { epsuId })}
            destructive
          />
        </View>
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
  toolList: {
    gap: 12,
  },
  toolCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#f3d0dd',
    padding: 16,
  },
  toolCardDestructive: {
    borderColor: '#f0b5c0',
    backgroundColor: '#fff2f4',
  },
  toolTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#20131a',
    marginBottom: 4,
  },
  toolTitleDestructive: {
    color: '#c51f40',
  },
  toolMeta: {
    fontSize: 14,
    color: '#7f6170',
  },
  toolMetaDestructive: {
    color: '#9e4d5f',
  },
});
