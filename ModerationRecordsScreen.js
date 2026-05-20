import React, { useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchModerationRecords } from './lib/api/moderation';
import { UI } from './lib/uiTheme';

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'dismiss_report', label: 'Dismissed report' },
  { key: 'mute_author_24h', label: 'Muted author for 24h' },
  { key: 'remove_post', label: 'Removed post' },
  { key: 'change_member_role', label: 'Changed member permission' },
  { key: 'change_member_status', label: 'Changed membership state' },
  { key: 'kick_school_member', label: 'Kicked member' },
  { key: 'redeem_invite', label: 'Accepted invite' },
];

const DATE_RANGE_OPTIONS = [
  { key: 'all', label: 'All time' },
  { key: '24h', label: '24h' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
];

function formatAction(actionType) {
  if (actionType === 'dismiss_report') {
    return 'Dismissed report';
  }

  if (actionType === 'mute_author_24h') {
    return 'Muted author for 24h';
  }

  if (actionType === 'remove_post') {
    return 'Removed post';
  }

  if (actionType === 'change_member_role') {
    return 'Changed member permission';
  }

  if (actionType === 'change_member_status') {
    return 'Changed membership state';
  }

  if (actionType === 'kick_school_member') {
    return 'Kicked member';
  }

  if (actionType === 'redeem_invite') {
    return 'Accepted invite';
  }

  return actionType;
}

function formatTime(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getDateRangeCutoff(rangeKey) {
  const now = Date.now();

  if (rangeKey === '24h') {
    return now - 24 * 60 * 60 * 1000;
  }

  if (rangeKey === '7d') {
    return now - 7 * 24 * 60 * 60 * 1000;
  }

  if (rangeKey === '30d') {
    return now - 30 * 24 * 60 * 60 * 1000;
  }

  return null;
}

function formatDetailValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function RecordCard({ item }) {
  const detailEntries = Object.entries(item.details ?? {});

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{formatAction(item.actionType)}</Text>
      <Text style={styles.cardMeta}>By {item.actorEmail}</Text>
      {item.targetEmail ? <Text style={styles.cardMeta}>Affected user: {item.targetEmail}</Text> : null}
      {item.postId ? <Text style={styles.cardMeta}>Post: {item.postId}</Text> : null}
      {detailEntries.length ? (
        <View style={styles.detailsWrap}>
          <Text style={styles.detailsTitle}>Details</Text>
          {detailEntries.map(([key, value]) => (
            <Text key={key} style={styles.detailLine}>
              {key}: {formatDetailValue(value)}
            </Text>
          ))}
        </View>
      ) : null}
      <Text style={styles.cardTime}>{formatTime(item.createdAt)}</Text>
    </View>
  );
}

export default function ModerationRecordsScreen({ route, epsus }) {
  const insets = useSafeAreaInsets();
  const epsuId = route?.params?.epsuId ?? null;
  const epsu = epsus.find((item) => item.id === epsuId) ?? null;
  const [records, setRecords] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [moderatorQuery, setModeratorQuery] = useState('');
  const [targetQuery, setTargetQuery] = useState('');
  const [detailsQuery, setDetailsQuery] = useState('');

  const loadRecords = React.useCallback(() => {
    let isActive = true;

    fetchModerationRecords(epsuId)
      .then((result) => {
        if (isActive) {
          setRecords(result);
        }
      })
      .catch(() => {
        if (isActive) {
          setRecords([]);
        }
      });

    return () => {
      isActive = false;
    };
  }, [epsuId]);

  useEffect(() => {
    const cleanup = loadRecords();
    return cleanup;
  }, [loadRecords]);

  useFocusEffect(
    React.useCallback(() => {
      const cleanup = loadRecords();
      return cleanup;
    }, [loadRecords])
  );

  const availableFilterOptions = FILTER_OPTIONS;
  const visibleRecords = records;

  useEffect(() => {
    if (!availableFilterOptions.some((option) => option.key === activeFilter)) {
      setActiveFilter('all');
    }
  }, [activeFilter, availableFilterOptions]);

  const filteredRecords = useMemo(() => {
    const normalizedModeratorQuery = moderatorQuery.trim().toLowerCase();
    const normalizedTargetQuery = targetQuery.trim().toLowerCase();
    const normalizedDetailsQuery = detailsQuery.trim().toLowerCase();
    const cutoff = getDateRangeCutoff(dateRange);

    return visibleRecords.filter((item) => {
      if (activeFilter !== 'all' && item.actionType !== activeFilter) {
        return false;
      }

      if (cutoff) {
        const createdAt = new Date(item.createdAt).getTime();
        if (Number.isNaN(createdAt) || createdAt < cutoff) {
          return false;
        }
      }

      if (normalizedModeratorQuery && !String(item.actorEmail ?? '').toLowerCase().includes(normalizedModeratorQuery)) {
        return false;
      }

      if (normalizedTargetQuery && !String(item.targetEmail ?? '').toLowerCase().includes(normalizedTargetQuery)) {
        return false;
      }

      if (normalizedDetailsQuery) {
        const haystack = JSON.stringify(item.details ?? {}).toLowerCase();
        if (!haystack.includes(normalizedDetailsQuery)) {
          return false;
        }
      }

      return true;
    });
  }, [activeFilter, dateRange, detailsQuery, moderatorQuery, targetQuery, visibleRecords]);

  const headerContent = (
    <>
      <Text style={styles.sectionEyebrow}>Moderation records</Text>
      <Text style={styles.sectionTitle}>{epsu?.name ?? 'Epsu'}</Text>
      <View style={styles.filterWrap}>
        {availableFilterOptions.map((option) => {
          const isActive = option.key === activeFilter;
          return (
            <TouchableOpacity
              key={option.key}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => setActiveFilter(option.key)}
              activeOpacity={0.85}
            >
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.searchBlock}>
        <TextInput
          style={styles.filterInput}
          placeholder="Filter by moderator"
          placeholderTextColor="#8d6676"
          value={moderatorQuery}
          onChangeText={setModeratorQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={styles.filterInput}
          placeholder="Filter by affected user"
          placeholderTextColor="#8d6676"
          value={targetQuery}
          onChangeText={setTargetQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={styles.filterInput}
          placeholder="Filter by reason or details"
          placeholderTextColor="#8d6676"
          value={detailsQuery}
          onChangeText={setDetailsQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <View style={styles.filterWrap}>
        {DATE_RANGE_OPTIONS.map((option) => {
          const isActive = option.key === dateRange;
          return (
            <TouchableOpacity
              key={option.key}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => setDateRange(option.key)}
              activeOpacity={0.85}
            >
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );

  return (
    <View style={styles.screen}>
      <View style={[styles.content, { paddingTop: insets.top + 12 }]}>
        <FlatList
          data={filteredRecords}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={headerContent}
          contentContainerStyle={filteredRecords.length === 0 ? styles.emptyContent : styles.list}
          renderItem={({ item }) => <RecordCard item={item} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No moderation records</Text>
              <Text style={styles.emptyText}>
                {activeFilter === 'all'
                  ? 'Actions by moderators and hosts will appear here'
                  : 'No records in this category'}
              </Text>
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
    marginBottom: UI.header.eyebrowGap,
  },
  sectionTitle: {
    fontSize: UI.header.titleSize,
    fontWeight: '900',
    color: UI.colors.text,
    marginBottom: UI.header.sectionGap,
  },
  filterWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    minHeight: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: UI.colors.border,
    backgroundColor: UI.colors.surface,
    paddingHorizontal: 12,
    justifyContent: 'center',
    maxWidth: '100%',
  },
  filterChipActive: {
    backgroundColor: UI.colors.primary,
    borderColor: UI.colors.primary,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '800',
    color: UI.colors.textMuted,
    flexShrink: 1,
  },
  filterChipTextActive: {
    color: UI.colors.surface,
  },
  searchBlock: {
    gap: 10,
    marginBottom: 14,
  },
  filterInput: {
    minHeight: 56,
    borderRadius: UI.radius.row,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
    paddingHorizontal: 14,
    fontSize: 15,
    color: UI.colors.text,
  },
  list: {
    gap: UI.spacing.gap,
    paddingBottom: 18,
  },
  emptyContent: {
    flexGrow: 1,
    paddingBottom: 18,
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
    backgroundColor: UI.colors.surface,
    borderRadius: UI.radius.card,
    borderWidth: 1,
    borderColor: UI.colors.border,
    padding: UI.spacing.card,
    minHeight: UI.browseCard.minHeight,
  },
  cardTitle: {
    fontSize: UI.browseCard.titleSize,
    fontWeight: '900',
    color: UI.colors.text,
    marginBottom: 6,
  },
  cardMeta: {
    fontSize: 13,
    color: UI.colors.textMuted,
    marginBottom: 4,
  },
  detailsWrap: {
    marginTop: 8,
  },
  detailsTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: UI.colors.textSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  detailLine: {
    fontSize: 13,
    lineHeight: 19,
    color: UI.colors.textMuted,
    marginBottom: 4,
  },
  cardTime: {
    marginTop: 6,
    fontSize: 13,
    color: UI.colors.textSoft,
  },
});
