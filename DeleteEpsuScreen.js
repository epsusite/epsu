import React, { useMemo, useState } from 'react';
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showAppDialog } from './components/AppDialog';
import useSubmitButtonAnimation from './lib/useSubmitButtonAnimation';

function getCounterText(length, minLength, maxLength) {
  if (length < minLength) {
    return `${length}/${minLength}`;
  }

  return `${length}/${maxLength}`;
}

export default function DeleteEpsuScreen({ navigation, route, onDeleteEpsu, epsus }) {
  const insets = useSafeAreaInsets();
  const [typedName, setTypedName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const epsuId = route?.params?.epsuId ?? null;
  const epsu = useMemo(() => epsus.find((item) => item.id === epsuId) ?? null, [epsuId, epsus]);
  const expectedName = epsu?.name ?? '';
  const canSubmit = typedName.trim() === expectedName && !isSubmitting;
  const submitAnimationStyle = useSubmitButtonAnimation(canSubmit);

  const handleDelete = async () => {
    if (!epsuId) {
      showAppDialog('Delete Epsu', 'This Epsu could not be found');
      return;
    }

    if (!expectedName || typedName.trim() !== expectedName || isSubmitting) {
      return;
    }

    Keyboard.dismiss();
    setIsSubmitting(true);

    try {
      const result = await onDeleteEpsu(epsuId);
      if (result?.ok) {
        navigation.navigate('HomeMain');
        return;
      }

      showAppDialog('Delete Epsu', result?.message ?? 'Could not delete this Epsu');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]} keyboardShouldPersistTaps="always">
        <Text style={styles.sectionEyebrow}>Epsu deletion</Text>
        <Text style={styles.sectionTitle}>Are you sure you want to delete this Epsu?</Text>

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
          },
          submitAnimationStyle,
        ]}
      >
        <TouchableOpacity
          style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
          onPress={handleDelete}
          activeOpacity={0.85}
          disabled={!canSubmit}
        >
          <Text style={styles.submitText}>{isSubmitting ? 'Deleting...' : 'Submit'}</Text>
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
    minHeight: 56,
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
  submitButtonDisabled: {
    backgroundColor: '#b97a8a',
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
});
