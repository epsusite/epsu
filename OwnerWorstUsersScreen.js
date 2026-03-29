import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { fetchWorstUsers } from './lib/epsuApi';

function WorstUserCard({ item }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.label}</Text>
      <Text style={styles.cardMeta}>{item.removedCount} posts removed by mods</Text>
    </View>
  );
}

export default function OwnerWorstUsersScreen({ route, epsus }) {
  const epsuId = route?.params?.epsuId ?? null;
  const epsu = epsus.find((item) => item.id === epsuId) ?? null;
  const [worstUsers, setWorstUsers] = useState([]);

  useEffect(() => {
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

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.sectionEyebrow}>Worst users</Text>
        <Text style={styles.sectionTitle}>{epsu?.name ?? 'Epsu'}</Text>
        <FlatList
          data={worstUsers}
          keyExtractor={(item) => item.authorId}
          contentContainerStyle={worstUsers.length === 0 ? styles.emptyContent : styles.list}
          renderItem={({ item }) => <WorstUserCard item={item} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No bad actors yet</Text>
              <Text style={styles.emptyText}>Nobody here has stacked up removed posts yet</Text>
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
    fontSize: 14,
    color: '#7f6170',
  },
});
