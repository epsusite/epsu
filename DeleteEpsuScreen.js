import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function getCounterText(length, minLength, maxLength) {
  if (length < minLength) {
    return `${length}/${minLength}`;
  }

  return `${length}/${maxLength}`;
}

export default function DeleteEpsuScreen({ navigation, route, onDeleteEpsu, epsus }) {
  const insets = useSafeAreaInsets();
  const [typedName, setTypedName] = useState('');
  const buttonOpacity = useRef(new Animated.Value(0)).current;
  const epsuId = route?.params?.epsuId ?? null;
  const epsu = useMemo(() => epsus.find((item) => item.id === epsuId) ?? null, [epsuId, epsus]);
  const expectedName = epsu?.name ?? '';
  const canSubmit = typedName.trim() === expectedName;

  useEffect(() => {
    Animated.timing(buttonOpacity, {
      toValue: canSubmit ? 1 : 0,
      duration: canSubmit ? 2000 : 180,
      useNativeDriver: true,
    }).start();
  }, [buttonOpacity, canSubmit]);

  const handleDelete = async () => {
    if (!canSubmit || !epsuId) {
      return;
    }

    const result = await onDeleteEpsu(epsuId);
    if (result?.ok) {
      navigation.navigate('HomeMain');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionEyebrow}>Epsu deletion</Text>
        <Text style={styles.sectionTitle}>Are you sure to wish this Epsu?</Text>

        <Text style={styles.hint}>
          Type {expectedName || 'this Epsu'} exactly to continue
        </Text>

        <View style={styles.fieldBlock}>
          <Text style={styles.counter}>
            {getCounterText(typedName.length, expectedName.length || 1, expectedName.length || 1)}
          </Text>
          <TextInput
            style={styles.input}
            placeholder={expectedName || 'Type Epsu name'}
            placeholderTextColor="#8d6676"
            value={typedName}
            onChangeText={setTypedName}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </ScrollView>

      <Animated.View
        pointerEvents={canSubmit ? 'auto' : 'none'}
        style={[
          styles.submitWrap,
          {
            paddingBottom: insets.bottom + 16,
            opacity: buttonOpacity,
          },
        ]}
      >
        <TouchableOpacity style={styles.submitButton} onPress={handleDelete} activeOpacity={0.85}>
          <Text style={styles.submitText}>Delete Epsu</Text>
        </TouchableOpacity>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff8fb',
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 110,
    gap: 18,
  },
  sectionEyebrow: {
    fontSize: 13,
    fontWeight: '800',
    color: '#8d6676',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#20131a',
  },
  hint: {
    fontSize: 15,
    color: '#7a5968',
  },
  fieldBlock: {
    gap: 8,
  },
  counter: {
    fontSize: 14,
    fontWeight: '800',
    color: '#8a5e70',
  },
  input: {
    minHeight: 58,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3d0dd',
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: '#24171d',
    fontWeight: '600',
  },
  submitWrap: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 0,
  },
  submitButton: {
    backgroundColor: '#d72647',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
});
