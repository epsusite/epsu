import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchModerationRecords } from './lib/api/moderation';

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'dismiss_report', label: 'Dismissed report' },
  { key: 'mute_author_24h', label: 'Muted author for 24h' },
  { key: 'remove_post', label: 'Removed post' },
  { key: 'change_member_role', label: 'Changed member role' },
  { key: 'change_member_status', label: 'Changed member status' },
  { key: 'kick_school_member', label: 'Kicked school member' },
  { key: 'generate_invite', label: 'Generated invite' },
  { key: 'delete_epsu', label: 'Deleted Epsu' },
  { key: 'review_school_application', label: 'Reviewed school application' },
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
    return 'Changed member role';
  }

  if (actionType === 'change_member_status') {
    return 'Changed member status';
  }

  if (actionType === 'kick_school_member') {
    return 'Kicked school member';
  }

  if (actionType === 'generate_invite') {
    return 'Generated invite';
  }

  if (actionType === 'delete_epsu') {
    return 'Deleted Epsu';
  }

  if (actionType === 'review_school_application') {
    return 'Reviewed school application';
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

  useEffect(() => {
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

  return (
    <View style={styles.screen}>
      <View style={[styles.content, { paddingTop: insets.top + 12 }]}>
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
        <FlatList
          data={filteredRecords}
          keyExtractor={(item) => item.id}
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
    marginBottom: 14,
  },
  filterWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#f3d0dd',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 9,
    maxWidth: '100%',
  },
  filterChipActive: {
    backgroundColor: '#e52b50',
    borderColor: '#e52b50',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#7f6170',
    flexShrink: 1,
  },
  filterChipTextActive: {
    color: '#fff',
  },
  searchBlock: {
    gap: 10,
    marginBottom: 14,
  },
  filterInput: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3d0dd',
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#24171d',
  },
  list: {
    gap: 10,
    paddingBottom: 18,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#20131a',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    color: '#7a5968',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#f3d0dd',
    padding: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#20131a',
    marginBottom: 6,
  },
  cardMeta: {
    fontSize: 13,
    color: '#7f6170',
    marginBottom: 4,
  },
  detailsWrap: {
    marginTop: 8,
  },
  detailsTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#8d6676',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  detailLine: {
    fontSize: 13,
    lineHeight: 19,
    color: '#7f6170',
    marginBottom: 4,
  },
  cardTime: {
    marginTop: 6,
    fontSize: 13,
    color: '#8a5e70',
  },
});
