import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function RentEpsuScreen() {
  return (
    <View style={styles.content}>
      <Text style={styles.sectionEyebrow}>Rent a new Epsu</Text>
      <Text style={styles.sectionTitle}>Details</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    backgroundColor: '#fff8fb',
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
  },
});
