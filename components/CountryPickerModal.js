import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { COUNTRIES } from '../lib/countries';
import { UI } from '../lib/uiTheme';

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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.searchInput}
            placeholder="Search countries"
            placeholderTextColor={UI.colors.textSoft}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="words"
            autoCorrect={false}
          />
          <FlatList
            data={filteredCountries}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            contentContainerStyle={styles.listContent}
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: UI.colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: UI.modal.overlayPadding,
    paddingVertical: UI.modal.overlayPadding,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '86%',
    borderRadius: UI.radius.modal,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
    paddingHorizontal: UI.spacing.modal,
    paddingTop: UI.spacing.modal,
    paddingBottom: UI.spacing.card,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: UI.spacing.gap,
    marginBottom: 14,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: UI.colors.text,
    flex: 1,
  },
  closeButton: {
    minHeight: UI.modal.buttonMinHeight,
    borderRadius: UI.radius.button,
    borderWidth: 1,
    borderColor: UI.colors.border,
    backgroundColor: UI.colors.surface,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: UI.colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  searchInput: {
    minHeight: 56,
    borderRadius: UI.radius.row,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
    paddingHorizontal: 16,
    fontSize: 15,
    color: UI.colors.text,
    marginBottom: 12,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingBottom: 4,
  },
  row: {
    minHeight: 56,
    borderRadius: UI.radius.row,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  rowSelected: {
    borderColor: UI.colors.primary,
    backgroundColor: UI.colors.surfaceMuted,
  },
  rowLabel: {
    color: UI.colors.text,
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    paddingRight: 12,
  },
  rowValue: {
    color: UI.colors.textSoft,
    fontSize: 14,
    fontWeight: '800',
  },
});
