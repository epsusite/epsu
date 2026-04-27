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
} from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showAppDialog } from './components/AppDialog';
import useSubmitButtonAnimation from './lib/useSubmitButtonAnimation';

const MIN_LENGTH = 10;
const MAX_LENGTH = 1000;

export default function SchoolApplicationScreen({ navigation, route, epsus, onSubmitSchoolApplication }) {
  const insets = useSafeAreaInsets();
  const [answer, setAnswer] = useState('');
  const epsuId = route?.params?.epsuId ?? null;
  const epsu = useMemo(() => epsus.find((item) => item.id === epsuId) ?? null, [epsuId, epsus]);
  const trimmedAnswer = answer.trim();
  const canSubmit = trimmedAnswer.length >= MIN_LENGTH && trimmedAnswer.length <= MAX_LENGTH;
  const submitAnimationStyle = useSubmitButtonAnimation(canSubmit);

  const handleSubmit = async () => {
    if (!canSubmit || !epsuId) {
      return;
    }

    const result = await onSubmitSchoolApplication({
      epsuId,
      answer: trimmedAnswer,
    });

    if (!result?.ok) {
      const normalizedMessage = (result?.message ?? '').toLowerCase();
      if (
        normalizedMessage.includes('owner') ||
        normalizedMessage.includes('lead') ||
        normalizedMessage.includes('host')
      ) {
        navigation.navigate('HomeEpsu', { epsuId });
        return;
      }
      if (normalizedMessage.includes('three school epsus')) {
        showAppDialog(
          'School Epsu limit reached',
          'Leave one of your current school Epsus before joining this one'
        );
        navigation.goBack();
        return;
      }
      showAppDialog('School application', result?.message ?? 'Could not submit application');
      return;
    }

    showAppDialog('School application', 'Application sent for host review');
    navigation.navigate('HomeMain');
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]} keyboardShouldPersistTaps="always">
        <Text style={styles.sectionEyebrow}>School application</Text>
        <Text style={styles.sectionTitle}>{epsu?.name ?? 'School Epsu'}</Text>
        <Text style={styles.helper}>Why should you be let into this school Epsu?</Text>
        <Text style={styles.counter}>{trimmedAnswer.length}/{MAX_LENGTH}</Text>
        <TextInput
          style={styles.input}
          placeholder="Write 10 to 1000 characters"
          placeholderTextColor="#8d6676"
          multiline
          textAlignVertical="top"
          value={answer}
          onChangeText={(value) => {
            if (value.length <= MAX_LENGTH) {
              setAnswer(value);
            }
          }}
        />
      </ScrollView>

      <Animated.View
        pointerEvents={canSubmit ? 'auto' : 'none'}
        style={[styles.submitWrap, { paddingBottom: insets.bottom + 16 }, submitAnimationStyle]}
      >
        <TouchableOpacity style={styles.submitButton} onPressIn={() => { Keyboard.dismiss(); handleSubmit(); }} activeOpacity={0.85}>
          <Text style={styles.submitText}>Submit</Text>
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
    gap: 16,
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
  helper: {
    fontSize: 15,
    lineHeight: 22,
    color: '#7a5968',
  },
  counter: {
    fontSize: 14,
    fontWeight: '800',
    color: '#8a5e70',
  },
  input: {
    minHeight: 220,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3d0dd',
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    lineHeight: 24,
    color: '#24171d',
  },
  submitWrap: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 0,
  },
  submitButton: {
    backgroundColor: '#e52b50',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
});
