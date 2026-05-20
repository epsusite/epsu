import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ModQueueScreen from './ModQueueScreen';
import { fetchAllQueuedPosts } from './lib/api/moderation';
import { getSchoolLogoUrl } from './lib/schoolLogo';
import { UI } from './lib/uiTheme';

const REGIONAL_SCOPES = ['city', 'state', 'country'];

function AdminEpsuCard({ item, queuedCount, onPress }) {
  const logoUrl = item.logo_path ? getSchoolLogoUrl(item.logo_path) : null;
  const queueLabel =
    queuedCount === 1 ? '1 post waiting for release' : `${queuedCount} posts waiting for release`;
  const isRegional = REGIONAL_SCOPES.includes(item.scope);

  return (
    <TouchableOpacity style={styles.epsuCard} onPress={() => onPress(item.id)} activeOpacity={0.85}>
      <View style={styles.epsuBadge}>
        {logoUrl ? (
          <Image source={{ uri: logoUrl }} style={styles.epsuBadgeImage} contentFit="cover" />
        ) : (
          <View style={styles.epsuBadgePlaceholder} />
        )}
      </View>
      <View style={styles.epsuCopy}>
        <Text style={styles.epsuName}>{item.name}</Text>
        <Text style={styles.epsuMeta}>{item.scope === 'school' ? 'School Epsu' : isRegional ? 'Regional Epsu' : 'Other Epsu'}</Text>
        <Text style={styles.epsuQueueMeta}>{queueLabel}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function AdminFullhourQueueScreen(props) {
  const { currentUserId, route, navigation, epsus = [] } = props;
  const insets = useSafeAreaInsets();
  const [queuedPosts, setQueuedPosts] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [ignoredPostIds, setIgnoredPostIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [epsuCategory, setEpsuCategory] = useState('regional');
  const selectedEpsuId = route?.params?.epsuId ?? null;

  const ignoredStorageKey = currentUserId ? `admin_fullhour_ignored_posts_${currentUserId}` : null;

  const loadIgnoredPostIds = React.useCallback(async () => {
    if (!ignoredStorageKey) {
      setIgnoredPostIds([]);
      return;
    }

    try {
      const rawValue = await AsyncStorage.getItem(ignoredStorageKey);
      const parsedValue = rawValue ? JSON.parse(rawValue) : [];
      setIgnoredPostIds(Array.isArray(parsedValue) ? parsedValue.filter(Boolean) : []);
    } catch {
      setIgnoredPostIds([]);
    }
  }, [ignoredStorageKey]);

  const persistIgnoredPostIds = async (nextIds) => {
    if (!ignoredStorageKey) {
      return;
    }

    try {
      await AsyncStorage.setItem(ignoredStorageKey, JSON.stringify(nextIds));
    } catch {
      // ignore storage write failures for the hidden admin queue list
    }
  };

  const handleIgnorePost = async (postId) => {
    const nextIds = ignoredPostIds.includes(postId) ? ignoredPostIds : [...ignoredPostIds, postId];
    setIgnoredPostIds(nextIds);
    await persistIgnoredPostIds(nextIds);
  };

  const loadQueuedPosts = () => {
    let isActive = true;

    setIsRefreshing(true);
    fetchAllQueuedPosts()
      .then((data) => {
        if (isActive) {
          setQueuedPosts(data);
          setLoadError('');
        }
      })
      .catch((error) => {
        if (isActive) {
          setQueuedPosts([]);
          setLoadError(error?.message ?? 'Could not load the full-hour queue');
        }
      })
      .finally(() => {
        if (isActive) {
          setIsRefreshing(false);
        }
      });

    return () => {
      isActive = false;
    };
  };

  useEffect(() => {
    void loadIgnoredPostIds();
    const cleanup = loadQueuedPosts();
    return cleanup;
  }, [loadIgnoredPostIds]);

  useFocusEffect(
    React.useCallback(() => {
      void loadIgnoredPostIds();
      const cleanup = loadQueuedPosts();
      return cleanup;
    }, [loadIgnoredPostIds])
  );

  const visibleQueuedPosts = queuedPosts.filter((post) => !ignoredPostIds.includes(post.id));
  const queuedCountByEpsuId = visibleQueuedPosts.reduce((accumulator, post) => {
    accumulator[post.epsuId] = (accumulator[post.epsuId] ?? 0) + 1;
    return accumulator;
  }, {});
  const filteredEpsus = React.useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const eligibleEpsus = epsus
      .filter((epsu) => {
        if (epsuCategory === 'school') {
          return epsu.scope === 'school';
        }

        return REGIONAL_SCOPES.includes(epsu.scope);
      })
      .sort((left, right) => {
        const countGap = (queuedCountByEpsuId[right.id] ?? 0) - (queuedCountByEpsuId[left.id] ?? 0);
        if (countGap !== 0) {
          return countGap;
        }

        return left.name.localeCompare(right.name);
      });

    if (!normalizedQuery) {
      return eligibleEpsus;
    }

    return eligibleEpsus.filter((epsu) => epsu.name.toLowerCase().includes(normalizedQuery));
  }, [epsuCategory, epsus, queuedCountByEpsuId, searchQuery]);

  if (!selectedEpsuId) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
        <View style={styles.content}>
          <Text style={styles.sectionEyebrow}>Choose an Epsu</Text>
          <Text style={styles.sectionTitle}>Your Epsus</Text>
          {epsuCategory === 'school' ? (
            <Text style={styles.sectionHint}>School Epsus with posts still waiting for release</Text>
          ) : (
            <Text style={styles.sectionHint}>Regional Epsus with posts still waiting for release</Text>
          )}
          <View style={styles.categoryToggle}>
            <TouchableOpacity
              style={[styles.categoryButton, epsuCategory === 'regional' && styles.categoryButtonActive]}
              onPress={() => setEpsuCategory('regional')}
              activeOpacity={0.85}
            >
              <Text
                style={[styles.categoryButtonText, epsuCategory === 'regional' && styles.categoryButtonTextActive]}
              >
                Regional Epsus
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.categoryButton, epsuCategory === 'school' && styles.categoryButtonActive]}
              onPress={() => setEpsuCategory('school')}
              activeOpacity={0.85}
            >
              <Text
                style={[styles.categoryButtonText, epsuCategory === 'school' && styles.categoryButtonTextActive]}
              >
                School Epsus
              </Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.searchInput}
            placeholder={epsuCategory === 'school' ? 'Search school Epsus' : 'Search regional Epsus'}
            placeholderTextColor="#8d6676"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <FlatList
            data={filteredEpsus}
            keyExtractor={(item) => item.id}
            contentContainerStyle={filteredEpsus.length === 0 ? styles.emptyEpsuContent : styles.epsuList}
            renderItem={({ item }) => (
              <AdminEpsuCard
                item={item}
                queuedCount={queuedCountByEpsuId[item.id] ?? 0}
                onPress={(epsuId) => navigation.navigate('AdminFullhourQueue', { epsuId })}
              />
            )}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No Epsus found</Text>
                <Text style={styles.emptyText}>
                  {loadError ? loadError : 'Try a different search'}
                </Text>
              </View>
            }
          />
        </View>
      </View>
    );
  }

  return (
    <ModQueueScreen
      {...props}
      adminQueuedPosts={visibleQueuedPosts.filter((post) => post.epsuId === selectedEpsuId)}
      loadError={loadError}
      isRefreshing={isRefreshing}
      onIgnoreAdminQueuedPost={handleIgnorePost}
      onRefreshQueue={() => {
        const cleanup = loadQueuedPosts();
        return cleanup;
      }}
      onAfterModerationAction={() => {
        const cleanup = loadQueuedPosts();
        return cleanup;
      }}
    />
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
    marginBottom: UI.header.eyebrowGap,
  },
  sectionTitle: {
    fontSize: UI.header.titleSize,
    fontWeight: '900',
    color: UI.colors.text,
    marginBottom: UI.header.titleGap,
  },
  sectionHint: {
    fontSize: UI.header.hintSize,
    lineHeight: UI.header.hintLineHeight,
    color: UI.colors.textMuted,
    marginBottom: UI.header.sectionGap,
  },
  categoryToggle: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
    minHeight: 56,
    marginTop: 2,
    position: 'relative',
    zIndex: 2,
    elevation: 2,
    overflow: 'visible',
  },
  categoryButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: UI.radius.row,
    borderWidth: 1,
    borderColor: UI.colors.border,
    backgroundColor: UI.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  categoryButtonActive: {
    backgroundColor: UI.colors.primary,
    borderColor: UI.colors.primary,
  },
  categoryButtonText: {
    color: UI.colors.textMuted,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  categoryButtonTextActive: {
    color: '#fff',
  },
  searchInput: {
    minHeight: 56,
    borderRadius: UI.radius.row,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
    paddingHorizontal: 16,
    marginBottom: 14,
    marginTop: 0,
    fontSize: 15,
    color: UI.colors.text,
    position: 'relative',
    zIndex: 1,
  },
  epsuList: {
    paddingBottom: 18,
    gap: 12,
  },
  emptyEpsuContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 18,
  },
  epsuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: UI.browseCard.minHeight,
    backgroundColor: UI.colors.surface,
    borderRadius: UI.radius.card,
    padding: UI.spacing.card,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },
  epsuBadge: {
    width: UI.browseCard.badgeSize,
    height: UI.browseCard.badgeSize,
    borderRadius: UI.browseCard.badgeRadius,
    backgroundColor: UI.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: UI.browseCard.badgeGap,
  },
  epsuBadgeImage: {
    width: UI.browseCard.badgeSize,
    height: UI.browseCard.badgeSize,
    borderRadius: UI.browseCard.badgeRadius,
  },
  epsuBadgePlaceholder: {
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  epsuCopy: {
    flex: 1,
  },
  epsuName: {
    fontSize: UI.browseCard.titleSize,
    fontWeight: '900',
    color: UI.colors.text,
    marginBottom: 4,
  },
  epsuMeta: {
    fontSize: UI.browseCard.metaSize,
    color: UI.colors.textMuted,
    marginBottom: 2,
  },
  epsuQueueMeta: {
    fontSize: UI.browseCard.metaSize,
    color: UI.colors.textSoft,
    lineHeight: 20,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: UI.empty.horizontalPadding,
  },
  emptyTitle: {
    fontSize: UI.empty.titleSize,
    fontWeight: '900',
    color: UI.colors.text,
    marginBottom: UI.empty.iconGap,
  },
  emptyText: {
    fontSize: UI.empty.textSize,
    color: UI.colors.textMuted,
    textAlign: 'center',
  },
});
