import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

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

export default function OwnerToolsScreen({ navigation, route, epsus, memberships }) {
  const epsuId = route?.params?.epsuId ?? null;
  const epsu = epsus.find((item) => item.id === epsuId) ?? null;
  const filteredMemberships = useMemo(
    () => memberships.filter((item) => item.epsuId === epsuId),
    [epsuId, memberships]
  );
  const moderatorCount = filteredMemberships.filter((item) => item.role === 'moderator').length;

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.sectionEyebrow}>Owner tools</Text>
        <Text style={styles.sectionTitle}>{epsu?.name ?? 'Epsu'}</Text>

        <View style={styles.toolList}>
          <ToolCard
            title="Moderation team"
            meta={`${moderatorCount} mods`}
            onPress={() => navigation.navigate('OwnerTeam', { epsuId })}
          />
          <ToolCard
            title="Access and invite"
            meta="First link, join entry and QR later"
            onPress={() => navigation.navigate('OwnerAccess', { epsuId })}
          />
          <ToolCard
            title="Worst users"
            meta="By posts removed by mods"
            onPress={() => navigation.navigate('OwnerWorstUsers', { epsuId })}
          />
          <ToolCard
            title="Delete Epsu"
            meta="Permanent and owner-only"
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
