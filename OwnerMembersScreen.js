import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showAppDialog } from './components/AppDialog';

function ApplicationRow({ item, onApprove, onReject }) {
  return (
    <View style={styles.applicationRow}>
      <Text style={styles.answerLabel}>{item.email ?? 'Application'}</Text>
      {item.createdAt ? <Text style={styles.answerMeta}>{new Date(item.createdAt).toLocaleString()}</Text> : null}
      <Text style={styles.answerText}>{item.answer}</Text>
      <View style={styles.rowButtons}>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => onReject(item)} activeOpacity={0.85}>
          <Text style={styles.secondaryText}>Reject</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryButton} onPress={() => onApprove(item)} activeOpacity={0.85}>
          <Text style={styles.primaryText}>Approve</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function OwnerMembersScreen({ route, epsus, onFetchApplications, onReviewSchoolApplication }) {
  const insets = useSafeAreaInsets();
  const epsuId = route?.params?.epsuId ?? null;
  const epsu = epsus.find((item) => item.id === epsuId) ?? null;
  const [applications, setApplications] = useState([]);

  useEffect(() => {
    let isActive = true;

    onFetchApplications(epsuId)
      .then((result) => {
        if (isActive) {
          setApplications(result);
        }
      })
      .catch(() => {
        if (isActive) {
          setApplications([]);
        }
      });

    return () => {
      isActive = false;
    };
  }, [epsuId, onFetchApplications]);

  const handleReview = async (application, status) => {
    const result = await onReviewSchoolApplication(application.id, status);
    showAppDialog('Applications', result?.ok ? `Application ${status}` : 'Could not review application');

    if (result?.ok) {
      setApplications((current) => current.filter((item) => item.id !== application.id));
    }
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.content, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.sectionEyebrow}>Applications</Text>
        <Text style={styles.sectionTitle}>{epsu?.name ?? 'Epsu'}</Text>

        <FlatList
          data={applications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={applications.length === 0 ? styles.emptyContent : styles.list}
          renderItem={({ item }) => (
            <ApplicationRow
              item={item}
              onApprove={(application) => handleReview(application, 'approved')}
              onReject={(application) => handleReview(application, 'rejected')}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyBlock}>
              <Text style={styles.emptyTitle}>No pending applications</Text>
              <Text style={styles.emptyText}>New school applications will show up here</Text>
            </View>
          }
        />
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
    paddingBottom: 18,
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
  list: {
    gap: 12,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  applicationRow: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f3d0dd',
  },
  answerLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#8d6676',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  answerText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#24171d',
    marginBottom: 14,
  },
  answerMeta: {
    fontSize: 13,
    color: '#7f6170',
    marginBottom: 10,
  },
  rowButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e52b50',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  secondaryText: {
    color: '#e52b50',
    fontSize: 13,
    fontWeight: '800',
  },
  primaryButton: {
    borderRadius: 12,
    backgroundColor: '#e52b50',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  primaryText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  emptyBlock: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f3d0dd',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#20131a',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#7f6170',
  },
});
