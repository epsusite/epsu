import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

function InviteCard({ title, body }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{body}</Text>
    </View>
  );
}

export default function OwnerModInviteScreen({ route, epsus }) {
  const epsuId = route?.params?.epsuId ?? null;
  const epsu = epsus.find((item) => item.id === epsuId) ?? null;
  const inviteLink = useMemo(
    () => (epsu?.slug ? `https://epsu.site/mod/${epsu.slug}` : 'https://epsu.site/mod'),
    [epsu?.slug]
  );

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.sectionEyebrow}>Mod invite</Text>
        <Text style={styles.sectionTitle}>One-time link or QR</Text>

        <View style={styles.cardList}>
          <InviteCard title="One-time link" body={inviteLink} />
          <InviteCard title="QR entry" body="A scannable mod invite will appear here once camera flows are wired." />
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
  cardList: {
    gap: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#f3d0dd',
    padding: 16,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#20131a',
    marginBottom: 6,
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 21,
    color: '#7f6170',
  },
});
