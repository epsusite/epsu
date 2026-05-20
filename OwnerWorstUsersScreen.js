import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showAppDialog } from './components/AppDialog';
import { fetchWorstUsers } from './lib/api/moderation';
import { UI } from './lib/uiTheme';

function WorstUserCard({ item, onKick, isKicking = false }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.label}</Text>
      <Text style={styles.cardMeta}>{item.removedPostCount} posts removed</Text>
      <Text style={styles.cardMeta}>{item.muted24hCount} times muted for 24h</Text>
      <TouchableOpacity
        style={[styles.kickButton, isKicking && styles.kickButtonDisabled]}
        onPress={() => onKick(item)}
        activeOpacity={0.85}
        disabled={isKicking}
      >
        <Text style={styles.kickButtonText}>{isKicking ? 'Kicking...' : 'Kick out'}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function OwnerWorstUsersScreen({ route, epsus, onKickEpsuMember }) {
  const insets = useSafeAreaInsets();
  const epsuId = route?.params?.epsuId ?? null;
  const epsu = epsus.find((item) => item.id === epsuId) ?? null;
  const [worstUsers, setWorstUsers] = useState([]);
  const [kickingAuthorId, setKickingAuthorId] = useState(null);

  const loadWorstUsers = React.useCallback(() => {
    let isActive = true;

    fetchWorstUsers(epsuId)
      .then((result) => {
        if (isActive) {
          setWorstUsers(result);
        }
      })
      .catch(() => {
        if (isActive) {
          setWorstUsers([]);
        }
      });

    return () => {
      isActive = false;
    };
  }, [epsuId]);

  useEffect(() => {
    const cleanup = loadWorstUsers();
    return cleanup;
  }, [loadWorstUsers]);

  useFocusEffect(
    React.useCallback(() => {
      const cleanup = loadWorstUsers();
      return cleanup;
    }, [loadWorstUsers])
  );

  const handleKick = async (item) => {
    if (!onKickEpsuMember || !epsuId || !item?.authorId) {
      return;
    }

    setKickingAuthorId(item.authorId);
    try {
      const result = await onKickEpsuMember(epsuId, item.authorId);
      if (result?.ok) {
        setWorstUsers((current) => current.filter((entry) => entry.authorId !== item.authorId));
        showAppDialog('Worst users', 'Member kicked');
        return;
      }

      showAppDialog('Worst users', result?.message ?? 'Could not kick this member');
    } finally {
      setKickingAuthorId(null);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.content, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.sectionEyebrow}>Worst users</Text>
        <Text style={styles.sectionTitle}>{epsu?.name ?? 'Epsu'}</Text>
        <FlatList
          data={worstUsers}
          keyExtractor={(item) => item.authorId}
          contentContainerStyle={worstUsers.length === 0 ? styles.emptyContent : styles.list}
          renderItem={({ item }) => (
            <WorstUserCard
              item={item}
              onKick={handleKick}
              isKicking={kickingAuthorId === item.authorId}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No worst users yet</Text>
              <Text style={styles.emptyText}>Nobody here has removed-post or 24-hour mute history yet</Text>
            </View>
          }
        />
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
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: UI.colors.text,
    marginBottom: 18,
  },
  list: {
    gap: UI.spacing.gap,
    paddingBottom: 18,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: UI.empty.horizontalPadding,
  },
  emptyTitle: {
    fontSize: UI.empty.titleSize,
    fontWeight: '900',
    color: UI.colors.text,
    marginBottom: UI.empty.iconGap,
  },
  emptyText: {
    fontSize: UI.empty.textSize,
    color: UI.colors.textMuted,
    textAlign: 'center',
  },
  card: {
    minHeight: 116,
    backgroundColor: UI.colors.surface,
    borderRadius: UI.radius.card,
    borderWidth: 1,
    borderColor: UI.colors.border,
    padding: UI.spacing.card,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: UI.colors.text,
    marginBottom: 6,
  },
  cardMeta: {
    fontSize: 14,
    color: UI.colors.textMuted,
    lineHeight: 21,
  },
  kickButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    minHeight: 44,
    backgroundColor: UI.colors.primary,
    borderRadius: UI.radius.button,
    paddingHorizontal: 14,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  kickButtonDisabled: {
    opacity: 0.6,
  },
  kickButtonText: {
    color: UI.colors.surface,
    fontSize: 14,
    fontWeight: '800',
  },
});
