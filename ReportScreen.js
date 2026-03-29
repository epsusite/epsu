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
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const REPORT_REASONS = [
  'Nudity or sexual activity',
  'Harassment or bullying',
  'Hate speech or symbols',
  'Violence or dangerous organizations',
  'Scam, spam or fraud',
  'False information',
  'Suicide, self-injury or eating disorders',
  'Illegal goods or criminal activity',
];

function ReasonItem({ label, onPress }) {
  return (
    <TouchableOpacity style={styles.reasonItem} onPress={() => onPress(label)} activeOpacity={0.85}>
      <Text style={styles.reasonText}>{label}</Text>
    </TouchableOpacity>
  );
}

function getCounterText(count, minCount, maxCount) {
  if (count < minCount) {
    return `${count}/${minCount}`;
  }

  return `${count}/${maxCount}`;
}

export default function ReportScreen({ mode = 'reason', navigation, route, onSubmitReport }) {
  const insets = useSafeAreaInsets();
  const [explanation, setExplanation] = useState('');
  const buttonOpacity = useRef(new Animated.Value(0)).current;
  const characterCount = useMemo(() => explanation.trim().length, [explanation]);
  const canSubmit = characterCount >= 10 && characterCount <= 1000;

  useEffect(() => {
    Animated.timing(buttonOpacity, {
      toValue: canSubmit ? 1 : 0,
      duration: canSubmit ? 2000 : 180,
      useNativeDriver: true,
    }).start();
  }, [buttonOpacity, canSubmit]);

  if (mode === 'reason') {
    return (
      <View style={styles.screen}>
        <View style={styles.content}>
          <Text style={styles.sectionEyebrow}>Report</Text>
          <Text style={styles.sectionTitle}>Select a reason</Text>
          <View style={styles.reasonList}>
            {REPORT_REASONS.map((reason) => (
              <ReasonItem
                key={reason}
                label={reason}
                onPress={(selectedReason) =>
                  navigation.navigate('ReportExplanation', {
                    postId: route?.params?.postId,
                    epsuId: route?.params?.epsuId,
                    reason: selectedReason,
                  })
                }
              />
            ))}
          </View>
        </View>
      </View>
    );
  }

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }

    const result = await onSubmitReport({
      epsuId: route?.params?.epsuId,
      postId: route?.params?.postId,
      reason: route?.params?.reason,
      explanation: explanation.trim(),
    });

    if (result?.ok || result?.duplicate) {
      navigation.navigate('HomeEpsu', { epsuId: route?.params?.epsuId });
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionEyebrow}>Explanation</Text>
        <Text style={styles.sectionTitle}>What exactly is wrong with this post?</Text>

        <View style={styles.fieldBlock}>
          <Text style={styles.counter}>{getCounterText(characterCount, 10, 1000)}</Text>
          <TextInput
            style={styles.bodyInput}
            placeholder="Explain what is wrong"
            placeholderTextColor="#8d6676"
            value={explanation}
            onChangeText={(value) => {
              if (value.length <= 1000) {
                setExplanation(value);
              }
            }}
            multiline
            textAlignVertical="top"
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
        <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} activeOpacity={0.85}>
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
  reasonList: {
    gap: 10,
  },
  reasonItem: {
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#f3d0dd',
  },
  reasonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#211319',
  },
  fieldBlock: {
    gap: 8,
  },
  counter: {
    fontSize: 14,
    fontWeight: '800',
    color: '#8a5e70',
  },
  bodyInput: {
    minHeight: 240,
    borderRadius: 18,
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
