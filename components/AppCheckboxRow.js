import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const THEMES = {
  light: {
    boxBorder: '#f0b7ca',
    boxBackground: '#fff',
    boxCheckedBackground: '#e52b50',
    boxCheckedBorder: '#e52b50',
    tick: '#fff',
    text: '#20131a',
  },
  dark: {
    boxBorder: '#f0b7ca',
    boxBackground: '#fff',
    boxCheckedBackground: '#e52b50',
    boxCheckedBorder: '#e52b50',
    tick: '#fff',
    text: '#fff',
  },
};

export default function AppCheckboxRow({ checked, children, onPress, theme = 'light' }) {
  const palette = THEMES[theme] ?? THEMES.light;

  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View
        style={[
          styles.box,
          {
            borderColor: palette.boxBorder,
            backgroundColor: palette.boxBackground,
          },
          checked && {
            backgroundColor: palette.boxCheckedBackground,
            borderColor: palette.boxCheckedBorder,
          },
        ]}
      >
        {checked ? <Text style={[styles.tick, { color: palette.tick }]}>V</Text> : null}
      </View>
      <View style={styles.content}>
        <Text style={[styles.text, { color: palette.text }]}>{children}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingTop: 4,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  tick: {
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 16,
  },
  content: {
    flex: 1,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
});
