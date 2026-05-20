import React, { useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchEpsuMemberships } from './lib/api/epsus';
import { requireSupabase } from './lib/supabase';
import { UI } from './lib/uiTheme';

function ToolCard({ title, meta, onPress, destructive = false }) {
  return (
    <TouchableOpacity
      style={[styles.toolCard, destructive && styles.toolCardDestructive]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text style={[styles.toolTitle, destructive && styles.toolTitleDestructive]}>{title}</Text>
      <Text style={[styles.toolMeta, destructive && styles.toolMetaDestructive]}>{meta}</Text>
    </TouchableOpacity>
  );
}

function isVisibleModerationMember(item) {
  if (!['active', 'muted'].includes(item.status)) {
    return false;
  }

  return Boolean(item.isAdmin || ['host', 'moderator', 'admin'].includes(item.role));
}

export default function OwnerToolsScreen({
  navigation,
  route,
  epsus,
  memberships,
  currentUserId,
  currentIsAdmin = false,
}) {
  const insets = useSafeAreaInsets();
  const epsuId = route?.params?.epsuId ?? null;
  const epsu = epsus.find((item) => item.id === epsuId) ?? null;
  const [liveMemberships, setLiveMemberships] = React.useState(null);
  const supabase = React.useMemo(() => requireSupabase(), []);
  const sourceMemberships = liveMemberships ?? memberships;

  const loadModerationTeam = React.useCallback(async () => {
    if (!epsuId) {
      setLiveMemberships(null);
      return;
    }

    try {
      const result = await fetchEpsuMemberships(epsuId, { includePlatformAdmins: true });
      setLiveMemberships(result);
    } catch {
      setLiveMemberships(null);
    }
  }, [epsuId]);

  useFocusEffect(
    React.useCallback(() => {
      void loadModerationTeam();
      return undefined;
    }, [loadModerationTeam])
  );

  React.useEffect(() => {
    if (!epsuId) {
      return undefined;
    }

    let refreshTimeoutId = null;
    const scheduleRefresh = () => {
      if (refreshTimeoutId) {
        clearTimeout(refreshTimeoutId);
      }

      refreshTimeoutId = setTimeout(() => {
        refreshTimeoutId = null;
        void loadModerationTeam();
      }, 250);
    };

    const membershipChannel = supabase
      .channel(`owner-tools-team:${epsuId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'epsu_memberships',
          filter: `epsu_id=eq.${epsuId}`,
        },
        () => {
          scheduleRefresh();
        }
      )
      .subscribe();

    const adminChannel = supabase
      .channel(`owner-tools-admins:${epsuId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
        },
        () => {
          scheduleRefresh();
        }
      )
      .subscribe();

    return () => {
      if (refreshTimeoutId) {
        clearTimeout(refreshTimeoutId);
      }
      void supabase.removeChannel(membershipChannel);
      void supabase.removeChannel(adminChannel);
    };
  }, [epsuId, loadModerationTeam, supabase]);

  const filteredMemberships = useMemo(
    () => sourceMemberships.filter((item) => item.epsuId === epsuId),
    [epsuId, sourceMemberships]
  );
  const moderatorCount = useMemo(() => {
    const moderatorProfileIds = new Set(
      filteredMemberships
        .filter(isVisibleModerationMember)
        .map((item) => item.profileId)
        .filter(Boolean)
    );

    return moderatorProfileIds.size;
  }, [filteredMemberships]);

  return (
    <View style={styles.screen}>
      <View style={[styles.content, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.sectionEyebrow}>Host tools</Text>
        <Text style={styles.sectionTitle}>{epsu?.name ?? 'Epsu'}</Text>

        <View style={styles.toolList}>
          <ToolCard
            title="Moderation team"
            meta={`${moderatorCount} mods`}
            onPress={() => navigation.navigate('OwnerTeam', { epsuId })}
          />
          <ToolCard
            title="Worst users"
            meta="By reports from different people"
            onPress={() => navigation.navigate('OwnerWorstUsers', { epsuId })}
          />
          <ToolCard
            title="Delete Epsu"
            meta="Permanent and host-only"
            onPress={() => navigation.navigate('DeleteEpsu', { epsuId })}
            destructive
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: UI.colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: UI.spacing.screen,
  },
  sectionEyebrow: {
    fontSize: 13,
    fontWeight: '800',
    color: UI.colors.textSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: UI.colors.text,
    marginBottom: 18,
  },
  toolList: {
    gap: UI.spacing.gap,
  },
  toolCard: {
    minHeight: 104,
    backgroundColor: UI.colors.surface,
    borderRadius: UI.radius.card,
    borderWidth: 1,
    borderColor: UI.colors.border,
    padding: UI.spacing.card,
    justifyContent: 'center',
  },
  toolCardDestructive: {
    borderColor: '#f0b5c0',
    backgroundColor: '#fff2f4',
  },
  toolTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: UI.colors.text,
    marginBottom: 4,
  },
  toolTitleDestructive: {
    color: UI.colors.danger,
  },
  toolMeta: {
    fontSize: 14,
    color: UI.colors.textMuted,
    lineHeight: 21,
  },
  toolMetaDestructive: {
    color: '#9e4d5f',
  },
});
