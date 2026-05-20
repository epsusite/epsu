import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function InviteCard({ title, body }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{body}</Text>
    </View>
  );
}

export default function OwnerModInviteScreen({ route, epsus, onEnsureInvite, onFetchInviteStatus }) {
  const insets = useSafeAreaInsets();
  const epsuId = route?.params?.epsuId ?? null;
  const epsu = epsus.find((item) => item.id === epsuId) ?? null;
  void epsu;
  const [qrValue, setQrValue] = useState('');
  const [statusText, setStatusText] = useState('Generating QR');
  const [inviteStatusLabel, setInviteStatusLabel] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const isLoadingRef = useRef(false);

  const applyInviteStatus = useCallback((result) => {
    if (!result?.token) {
      setQrValue('');
      setInviteStatusLabel('');
      setStatusText(result?.message ?? 'Could not load QR');
      return false;
    }

    const isValid = Boolean(result.is_active) && Number(result.use_count ?? 0) < Number(result.max_uses ?? 1);
    setQrValue(`https://epsu.site/mod.html?token=${encodeURIComponent(result.token)}`);
    setInviteStatusLabel(isValid ? 'Valid' : 'Expired');
    setStatusText(isValid ? 'This QR can still be used' : 'This QR was already used');
    return isValid;
  }, []);

  const refreshInviteStatus = useCallback(async () => {
    if (!epsuId || isLoadingRef.current) {
      return;
    }

    isLoadingRef.current = true;
    setIsLoading(true);
    const result = await onFetchInviteStatus(epsuId, 'moderator');
    isLoadingRef.current = false;
    setIsLoading(false);

    if (!result?.ok) {
      setQrValue('');
      setInviteStatusLabel('');
      setStatusText(result?.message ?? 'Could not load QR');
      return;
    }

    if (!result?.token) {
      const created = await onEnsureInvite(epsuId, 'moderator', { forceNew: false });
      if (!created?.ok || !created?.token) {
        setQrValue('');
        setInviteStatusLabel('');
        setStatusText(created?.message ?? 'Could not generate QR');
        return;
      }

      applyInviteStatus(created);
      return;
    }

    applyInviteStatus(result);
  }, [applyInviteStatus, epsuId, onEnsureInvite, onFetchInviteStatus]);

  const loadInvite = useCallback(async (forceNew = false) => {
    if (!epsuId || isLoadingRef.current) {
      return;
    }

    isLoadingRef.current = true;
    setIsLoading(true);
    setStatusText(forceNew ? 'Generating QR' : 'Loading QR');
    const result = await onEnsureInvite(epsuId, 'moderator', { forceNew });
    isLoadingRef.current = false;
    setIsLoading(false);

    if (!result?.ok || !result?.token) {
      setQrValue('');
      setInviteStatusLabel('');
      setStatusText(result?.message ?? 'Could not generate QR');
      return;
    }

    applyInviteStatus(result);
  }, [applyInviteStatus, epsuId, onEnsureInvite]);

  useEffect(() => {
    if (!epsuId) {
      return;
    }

    void refreshInviteStatus();
  }, [epsuId, refreshInviteStatus]);

  useFocusEffect(
    useCallback(() => {
      if (!epsuId) {
        return () => {};
      }

      void refreshInviteStatus();
      return () => {};
    }, [epsuId, refreshInviteStatus])
  );

  return (
    <View style={styles.screen}>
      <View style={[styles.content, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.sectionEyebrow}>Mod invite</Text>
        <Text style={styles.sectionTitle}>Moderator QR</Text>

        <View style={styles.cardList}>
          {qrValue ? (
            <View style={styles.qrWrap}>
              <QRCode value={qrValue} size={180} color="#20131a" backgroundColor="#fff" />
            </View>
          ) : (
            <InviteCard title="Moderator QR" body={statusText} />
          )}
          <InviteCard title="QR status" body={inviteStatusLabel ? `${inviteStatusLabel}. ${statusText}` : statusText} />
          <InviteCard title="QR entry" body="Scan this QR in the Epsu app to add a moderator" />
          <TouchableOpacity
            style={[styles.actionButton, isLoading && styles.actionButtonDisabled]}
            onPress={() => {
              void loadInvite(true);
            }}
            activeOpacity={0.85}
            disabled={isLoading}
          >
            <Text style={styles.actionText}>{isLoading ? 'Generating' : 'Generate new QR'}</Text>
          </TouchableOpacity>
        </View>
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
  cardList: {
    gap: 12,
  },
  qrWrap: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#f3d0dd',
    padding: 20,
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#f3d0dd',
    padding: 16,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#20131a',
    marginBottom: 6,
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 21,
    color: '#7f6170',
  },
  actionButton: {
    borderRadius: 16,
    backgroundColor: '#e52b50',
    paddingVertical: 15,
    alignItems: 'center',
  },
  actionButtonDisabled: {
    backgroundColor: '#b97a8a',
  },
  actionText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
});
