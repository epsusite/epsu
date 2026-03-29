import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

function AccessCard({ title, body }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{body}</Text>
    </View>
  );
}

export default function OwnerAccessScreen({ route, epsus }) {
  const epsuId = route?.params?.epsuId ?? null;
  const epsu = epsus.find((item) => item.id === epsuId) ?? null;
  const inviteLink = useMemo(
    () => (epsu?.slug ? `https://epsu.site/join/${epsu.slug}` : 'https://epsu.site/join'),
    [epsu?.slug]
  );

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.sectionEyebrow}>Access and invite</Text>
        <Text style={styles.sectionTitle}>{epsu?.name ?? 'Epsu'}</Text>

        <View style={styles.cardList}>
          <AccessCard
            title="Primary invite link"
            body={inviteLink}
          />
          <AccessCard
            title="Join entry"
            body="Owners will later accept or decline new members from here."
          />
          <AccessCard
            title="QR access"
            body="This Epsu will also get its first QR entry here once scanning is wired."
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
