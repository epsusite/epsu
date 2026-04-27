import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { COUNTRIES } from '../lib/countries';

export default function CountryPickerModal({ visible, onClose, onSelect, selectedCode, title = 'Select country' }) {
  const [query, setQuery] = useState('');

  const filteredCountries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return COUNTRIES;
    }

    return COUNTRIES.filter((country) =>
      country.name.toLowerCase().includes(normalizedQuery) ||
      country.englishName.toLowerCase().includes(normalizedQuery) ||
      country.code.toLowerCase().includes(normalizedQuery)
    );
  }, [query]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
        <TextInput
          style={styles.searchInput}
          placeholder="Search countries"
          placeholderTextColor="#8d6676"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="words"
          autoCorrect={false}
        />
        <FlatList
          data={filteredCountries}
          keyExtractor={(item) => item.code}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const isSelected = item.code === selectedCode;
            return (
              <Pressable
                style={[styles.row, isSelected && styles.rowSelected]}
                onPress={() => {
                  onSelect(item);
                  setQuery('');
                }}
              >
                <Text style={styles.rowLabel}>{item.name}</Text>
                <Text style={styles.rowValue}>{item.code}</Text>
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff8fb',
    paddingTop: 56,
    paddingHorizontal: 18,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#20131a',
  },
  closeText: {
    color: '#e52b50',
    fontSize: 16,
    fontWeight: '800',
  },
  searchInput: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3d0dd',
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#24171d',
    marginBottom: 12,
  },
  row: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3d0dd',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  rowSelected: {
    borderColor: '#e52b50',
    backgroundColor: '#fff1f5',
  },
  rowLabel: {
    color: '#211319',
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    paddingRight: 12,
  },
  rowValue: {
    color: '#7f6170',
    fontSize: 14,
    fontWeight: '800',
  },
});
