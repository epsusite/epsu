import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showAppDialog } from './components/AppDialog';

export const REPORT_REASONS = [
  'Nudity or sexual activity',
  'Harassment or bullying',
  'Hate speech or symbols',
  'Violence or dangerous organizations',
  'Scam, spam or fraud',
  'False information',
  'Suicide, self-injury or eating disorders',
  'Illegal goods or criminal activity',
];

function ReasonItem({ label, onPress, disabled, isSubmitting }) {
  return (
    <TouchableOpacity
      style={[styles.reasonItem, disabled && styles.reasonItemDisabled]}
      onPress={() => onPress(label)}
      activeOpacity={0.85}
      disabled={disabled}
    >
      <View style={styles.reasonRow}>
        <Text style={[styles.reasonText, isSubmitting && styles.reasonTextSubmitting]}>{label}</Text>
        {isSubmitting ? <ActivityIndicator size="small" color="#e52b50" /> : null}
      </View>
    </TouchableOpacity>
  );
}

export default function ReportScreen({ navigation, route, onSubmitReport }) {
  const insets = useSafeAreaInsets();
  const [submittingReason, setSubmittingReason] = useState(null);

  const navigateBackToFeed = () => {
    navigation.navigate('HomeEpsu', { epsuId: route?.params?.epsuId });
  };

  const handleSubmit = async (reason) => {
    if (submittingReason) {
      return;
    }

    setSubmittingReason(reason);
    const result = await onSubmitReport({
      epsuId: route?.params?.epsuId,
      postId: route?.params?.postId,
      reason,
    });

    if (result?.ok) {
      setSubmittingReason(null);
      showAppDialog('Report sent', 'Thanks, your report was sent to moderators for review', [
        {
          text: 'OK',
          onPress: navigateBackToFeed,
        },
      ]);
      return;
    }

    if (result?.duplicate) {
      setSubmittingReason(null);
      showAppDialog('Report', 'You already reported this post', [
        {
          text: 'OK',
          onPress: navigateBackToFeed,
        },
      ]);
      return;
    }

    setSubmittingReason(null);
    showAppDialog('Report', result?.message ?? "There's no connection");
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 24,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionEyebrow}>Report</Text>
        <Text style={styles.sectionTitle}>What's wrong with this post?</Text>
        <View style={styles.reasonList}>
          {REPORT_REASONS.map((reason) => (
            <ReasonItem
              key={reason}
              label={reason}
              disabled={Boolean(submittingReason)}
              isSubmitting={submittingReason === reason}
              onPress={handleSubmit}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff8fb',
  },
  content: {
    paddingHorizontal: 18,
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
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: '#f3d0dd',
    minHeight: 64,
    justifyContent: 'center',
  },
  reasonItemDisabled: {
    opacity: 0.6,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  reasonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: '#211319',
    lineHeight: 22,
  },
  reasonTextSubmitting: {
    color: '#8d6676',
  },
});
