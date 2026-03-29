import React, { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import LoginScreen from './LoginScreen';
import SignUpScreen from './SignUpScreen';
import HomeScreen from './HomeScreen';
import ModQueueScreen from './ModQueueScreen';
import OwnerToolsScreen from './OwnerToolsScreen';
import OwnerTeamScreen from './OwnerTeamScreen';
import OwnerAccessScreen from './OwnerAccessScreen';
import OwnerWorstUsersScreen from './OwnerWorstUsersScreen';
import OwnerModInviteScreen from './OwnerModInviteScreen';
import DeleteEpsuScreen from './DeleteEpsuScreen';
import PostScreen from './PostScreen';
import ReportScreen from './ReportScreen';
import RentEpsuScreen from './RentEpsuScreen';
import SettingsScreen from './SettingsScreen';
import { requireSupabase } from './lib/supabase';
import {
  createPost,
  deleteEpsu,
  dismissReport,
  ensurePrototypeRoles,
  fetchEpsus,
  fetchEpsuMemberships,
  fetchModeratedEpsuIds,
  fetchOpenReportsForEpsu,
  fetchOwnedEpsuIds,
  fetchPosts,
  fetchReportedPostIds,
  fetchReviewedPostIdsByEpsu,
  muteReportedAuthor,
  reportPost,
  reactToPost,
  removeReportedPost,
  syncStaticEpsus,
  updateMembershipRole,
} from './lib/epsuApi';

const Stack = createNativeStackNavigator();
const HomeStack = createNativeStackNavigator();
const SettingsStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
function PostTabIcon({ focused }) {
  if (!focused) {
    return <Ionicons name="add-circle-outline" size={24} color="#fff" />;
  }

  return (
    <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="ellipse" size={24} color="#fff" />
      <Text
        style={{
          position: 'absolute',
          color: '#e52b50',
          fontSize: 18,
          fontWeight: '900',
          lineHeight: 20,
        }}
      >
        +
      </Text>
    </View>
  );
}

function MainTabs({
  onLogout,
  onSubmitPost,
  epsus,
  posts,
  reviewedPostIdsByEpsu,
  reportedPostIds,
  onReactToPost,
  onReportPost,
  moderatedEpsuIds,
  ownedEpsuIds,
  reports,
  memberships,
  onDismissReport,
  onRemoveReportedPost,
  onMuteReportedAuthor,
  onPromoteMember,
  onDemoteModerator,
  onDeleteEpsu,
  currentUsername,
  currentEmail,
  currentPasswordLength,
  notificationsEnabled,
  onToggleNotifications,
  onChangePassword,
  onDeleteAccount,
}) {
  const insets = useSafeAreaInsets();

  function HomeStackScreen() {
    return (
      <HomeStack.Navigator screenOptions={{ headerShown: false }}>
        <HomeStack.Screen name="HomeMain">
          {(props) => (
            <HomeScreen
              {...props}
              epsus={epsus}
              posts={posts}
              reviewedPostIdsByEpsu={reviewedPostIdsByEpsu}
              reportedPostIds={reportedPostIds}
              onReactToPost={onReactToPost}
              onReportPost={onReportPost}
              moderatedEpsuIds={moderatedEpsuIds}
              ownedEpsuIds={ownedEpsuIds}
            />
          )}
        </HomeStack.Screen>
        <HomeStack.Screen name="HomeEpsu">
          {(props) => (
            <HomeScreen
              {...props}
              epsus={epsus}
              posts={posts}
              reviewedPostIdsByEpsu={reviewedPostIdsByEpsu}
              reportedPostIds={reportedPostIds}
              onReactToPost={onReactToPost}
              onReportPost={onReportPost}
              moderatedEpsuIds={moderatedEpsuIds}
              ownedEpsuIds={ownedEpsuIds}
            />
          )}
        </HomeStack.Screen>
        <HomeStack.Screen name="ModQueue">
          {(props) => (
            <ModQueueScreen
              {...props}
              epsus={epsus}
              posts={posts}
              reports={reports}
              onDismissReport={onDismissReport}
              onRemoveReportedPost={onRemoveReportedPost}
              onMuteReportedAuthor={onMuteReportedAuthor}
            />
          )}
        </HomeStack.Screen>
        <HomeStack.Screen name="Investigation">
          {(props) => (
            <ModQueueScreen
              {...props}
              mode="investigation"
              epsus={epsus}
              posts={posts}
              reports={reports}
              onDismissReport={onDismissReport}
              onRemoveReportedPost={onRemoveReportedPost}
              onMuteReportedAuthor={onMuteReportedAuthor}
            />
          )}
        </HomeStack.Screen>
        <HomeStack.Screen name="OwnerTools">
          {(props) => (
            <OwnerToolsScreen
              {...props}
              epsus={epsus}
              memberships={memberships}
            />
          )}
        </HomeStack.Screen>
        <HomeStack.Screen name="OwnerTeam">
          {(props) => (
            <OwnerTeamScreen
              {...props}
              epsus={epsus}
              memberships={memberships}
              onPromoteMember={onPromoteMember}
              onDemoteModerator={onDemoteModerator}
            />
          )}
        </HomeStack.Screen>
        <HomeStack.Screen name="OwnerAccess">
          {(props) => (
            <OwnerAccessScreen
              {...props}
              epsus={epsus}
            />
          )}
        </HomeStack.Screen>
        <HomeStack.Screen name="OwnerWorstUsers">
          {(props) => (
            <OwnerWorstUsersScreen
              {...props}
              epsus={epsus}
            />
          )}
        </HomeStack.Screen>
        <HomeStack.Screen name="OwnerModInvite">
          {(props) => (
            <OwnerModInviteScreen
              {...props}
              epsus={epsus}
            />
          )}
        </HomeStack.Screen>
        <HomeStack.Screen name="DeleteEpsu">
          {(props) => (
            <DeleteEpsuScreen
              {...props}
              epsus={epsus}
              onDeleteEpsu={onDeleteEpsu}
            />
          )}
        </HomeStack.Screen>
        <HomeStack.Screen name="ReportReason">
          {(props) => <ReportScreen {...props} mode="reason" onSubmitReport={onReportPost} />}
        </HomeStack.Screen>
        <HomeStack.Screen name="ReportExplanation">
          {(props) => <ReportScreen {...props} mode="explanation" onSubmitReport={onReportPost} />}
        </HomeStack.Screen>
        <HomeStack.Screen name="RentEpsu" component={RentEpsuScreen} />
      </HomeStack.Navigator>
    );
  }

  function SettingsStackScreen() {
    return (
      <SettingsStack.Navigator screenOptions={{ headerShown: false }}>
        <SettingsStack.Screen name="SettingsMain">
          {(props) => (
            <SettingsScreen
              {...props}
              currentUsername={currentUsername}
              currentEmail={currentEmail}
              currentPasswordLength={currentPasswordLength}
              notificationsEnabled={notificationsEnabled}
              onToggleNotifications={onToggleNotifications}
              onLogout={onLogout}
            />
          )}
        </SettingsStack.Screen>
        <SettingsStack.Screen name="ChangePassword">
          {(props) => (
            <SettingsScreen
              {...props}
              mode="change-password"
              onChangePassword={onChangePassword}
            />
          )}
        </SettingsStack.Screen>
        <SettingsStack.Screen name="DeleteAccount">
          {(props) => (
            <SettingsScreen
              {...props}
              mode="delete-account"
              onDeleteAccount={onDeleteAccount}
            />
          )}
        </SettingsStack.Screen>
      </SettingsStack.Navigator>
    );
  }

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          height: (Platform.OS === 'ios' ? 50 : 56) + insets.bottom,
          paddingBottom: insets.bottom,
          backgroundColor: '#e52b50',
          borderTopWidth: 0,
        },
        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: '#fff',
      }}
    >
      <Tab.Screen
        name="Post"
        options={{
          tabBarIcon: ({ focused }) => <PostTabIcon focused={focused} />,
        }}
      >
        {(props) => <PostScreen {...props} onSubmitPost={onSubmitPost} epsus={epsus} />}
      </Tab.Screen>
      <Tab.Screen
        name="Home"
        options={{
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              size={24}
              color={color}
            />
          ),
        }}
        listeners={({ navigation, route }) => ({
          tabPress: (event) => {
            const state = navigation.getState();
            const activeRoute = state.routes[state.index];
            const isFocused = activeRoute.key === route.key;
            const nestedRouteName = activeRoute.state?.routes?.[activeRoute.state.index ?? 0]?.name;

            if (isFocused && nestedRouteName && nestedRouteName !== 'HomeMain') {
              event.preventDefault();
              navigation.navigate('Home', { screen: 'HomeMain' });
            }
          },
        })}
        component={HomeStackScreen}
      />
      <Tab.Screen
        name="Settings"
        options={{
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? 'ellipsis-horizontal-circle' : 'ellipsis-horizontal-circle-outline'}
              size={24}
              color={color}
            />
          ),
        }}
        listeners={({ navigation, route }) => ({
          tabPress: (event) => {
            const state = navigation.getState();
            const activeRoute = state.routes[state.index];
            const isFocused = activeRoute.key === route.key;
            const nestedRouteName = activeRoute.state?.routes?.[activeRoute.state.index ?? 0]?.name;

            if (isFocused && nestedRouteName && nestedRouteName !== 'SettingsMain') {
              event.preventDefault();
              navigation.navigate('Settings', { screen: 'SettingsMain' });
            }
          },
        })}
        component={SettingsStackScreen}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const supabase = requireSupabase();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUsername, setCurrentUsername] = useState(null);
  const [currentEmail, setCurrentEmail] = useState(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [currentPasswordLength, setCurrentPasswordLength] = useState(8);
  const [isReady, setIsReady] = useState(false);
  const [epsus, setEpsus] = useState([]);
  const [posts, setPosts] = useState([]);
  const [reviewedPostIdsByEpsu, setReviewedPostIdsByEpsu] = useState({});
  const [reportedPostIds, setReportedPostIds] = useState([]);
  const [moderatedEpsuIds, setModeratedEpsuIds] = useState([]);
  const [ownedEpsuIds, setOwnedEpsuIds] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [reports, setReports] = useState([]);

  useEffect(() => {
    let isActive = true;

    const hydrateUser = async (user) => {
      if (!user || !isActive) {
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('username, notifications_enabled')
        .eq('id', user.id)
        .maybeSingle();

      if (!isActive) {
        return;
      }

      setCurrentUsername(profile?.username ?? user.user_metadata?.username ?? null);
      setCurrentEmail(user.email ?? null);
      setNotificationsEnabled(profile?.notifications_enabled ?? true);
      setCurrentPasswordLength(user.user_metadata?.password_length ?? 8);
      setIsAuthenticated(true);

      await syncStaticEpsus();
      await ensurePrototypeRoles(user.id);
      const [loadedEpsus, loadedPosts, loadedReviewedPostIdsByEpsu, loadedReportedPostIds, loadedModeratedEpsuIds, loadedOwnedEpsuIds] = await Promise.all([
        fetchEpsus(),
        fetchPosts(),
        fetchReviewedPostIdsByEpsu(user.id),
        fetchReportedPostIds(user.id),
        fetchModeratedEpsuIds(user.id),
        fetchOwnedEpsuIds(user.id),
      ]);
      const [loadedMemberships, loadedReports] = await Promise.all([
        Promise.all(loadedOwnedEpsuIds.map((epsuId) => fetchEpsuMemberships(epsuId))).then((result) =>
          result.flat()
        ),
        Promise.all(loadedModeratedEpsuIds.map((epsuId) => fetchOpenReportsForEpsu(epsuId))).then((result) =>
          result.flat()
        ),
      ]);

      if (!isActive) {
        return;
      }

      setEpsus(loadedEpsus);
      setPosts(loadedPosts);
      setReviewedPostIdsByEpsu(loadedReviewedPostIdsByEpsu);
      setReportedPostIds(loadedReportedPostIds);
      setModeratedEpsuIds(loadedModeratedEpsuIds);
      setOwnedEpsuIds(loadedOwnedEpsuIds);
      setMemberships(loadedMemberships);
      setReports(loadedReports);
    }

    async function initializeAuth() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!isActive) {
        return;
      }

      if (session?.user) {
        await hydrateUser(session.user);
      }

      setIsReady(true);
    }

    initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isActive) {
        return;
      }

      if (session?.user) {
        await hydrateUser(session.user);
        return;
      }

      setCurrentUsername(null);
      setCurrentEmail(null);
      setEpsus([]);
      setPosts([]);
      setReviewedPostIdsByEpsu({});
      setReportedPostIds([]);
      setModeratedEpsuIds([]);
      setOwnedEpsuIds([]);
      setMemberships([]);
      setReports([]);
      setIsAuthenticated(false);
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const handleSignUp = async ({ username, email, password }) => {
    const normalizedUsername = username.trim();

    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          username: normalizedUsername,
          password_length: password.length,
        },
      },
    });

    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes('user already registered') || message.includes('already been registered')) {
        return {
          ok: false,
          field: 'email',
          message: 'Email is already in use.',
        };
      }

      return {
        ok: false,
        field: 'email',
        message: error.message,
      };
    }

    if (data.user) {
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: data.user.id,
        username: normalizedUsername,
        notifications_enabled: true,
      });

      if (profileError) {
        return {
          ok: false,
          field: 'username',
          message: profileError.message,
        };
      }
    }

    if (!data.session) {
      return {
        ok: false,
        field: 'email',
        message: 'Check your email to verify your account before logging in.',
      };
    }

    return { ok: true };
  };

  const handleLogin = async ({ email, password }) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      return {
        ok: false,
        field: 'password',
        message: error.message,
      };
    }
    return { ok: true };
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleToggleNotifications = () => {
    setNotificationsEnabled((current) => !current);
  };

  const handleChangePassword = async ({ currentPassword, nextPassword }) => {
    const email = currentEmail;

    if (!email) {
      return {
        ok: false,
        message: 'No email is available for this account.',
      };
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });

    if (signInError) {
      return {
        ok: false,
        message: 'Current password is incorrect.',
      };
    }

    const { error } = await supabase.auth.updateUser({
      password: nextPassword,
      data: {
        password_length: nextPassword.length,
      },
    });

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    setCurrentPasswordLength(nextPassword.length);

    return { ok: true };
  };

  const handleDeleteAccount = async () => {
    return {
      ok: false,
      message: 'Account deletion needs a secure backend function before it can be enabled.',
    };
  };

  const handleSubmitPost = async ({ epsuId, title, body, replyToPostId = null }) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return;
    }

    const newPost = await createPost({
      epsuId,
      title,
      body,
      userId: user.id,
      replyToPostId,
    });

    setPosts((currentPosts) => [...currentPosts, newPost]);
  };

  const handleReactToPost = async (epsuId, postId, reaction) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return;
    }

    setReviewedPostIdsByEpsu((current) => {
      const existingIds = current[epsuId] ?? [];
      if (existingIds.includes(postId)) {
        return current;
      }

      return {
        ...current,
        [epsuId]: [...existingIds, postId],
      };
    });

    try {
      const result = await reactToPost({
        postId,
        userId: user.id,
        reaction,
      });

      if (result.duplicate) {
        return;
      }

      setPosts((currentPosts) =>
        currentPosts.flatMap((post) => {
          if (post.id !== postId) {
            return [post];
          }

          if (result.deleted) {
            return [];
          }

          return [
            {
              ...post,
              likeCount: result.likeCount,
              dislikeCount: result.dislikeCount,
            },
          ];
        })
      );
    } catch {
      setReviewedPostIdsByEpsu((current) => ({
        ...current,
        [epsuId]: (current[epsuId] ?? []).filter((id) => id !== postId),
      }));
    }
  };

  const handleReportPost = async ({ postId, reason, explanation = '' }) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false };
    }

    try {
      const result = await reportPost({
        postId,
        userId: user.id,
        reason,
        explanation,
      });

      if (result.duplicate) {
        setReportedPostIds((current) => (current.includes(postId) ? current : [...current, postId]));
        return { ok: false, duplicate: true };
      }

       const reportedPost = posts.find((post) => post.id === postId);
       if (reportedPost) {
         setReportedPostIds((current) => (current.includes(postId) ? current : [...current, postId]));
         setReports((current) => [
           ...current,
           {
             id: result.report?.id ?? `report-${postId}-${Date.now()}`,
             reason: result.report?.reason ?? (explanation ? `${reason}\n\n${explanation}` : reason),
             status: result.report?.status ?? 'open',
             createdAt: result.report?.createdAt ?? new Date().toISOString(),
             post: {
               id: reportedPost.id,
               epsuId: reportedPost.epsuId,
               number: reportedPost.number,
               title: reportedPost.title,
               body: reportedPost.body,
               authorId: reportedPost.authorId ?? null,
             },
           },
         ]);
       }

      return { ok: true };
    } catch {
      return { ok: false };
    }
  };

  const handleDismissReport = async (postId) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const targetReport = reports.find((report) => report.post.id === postId);
      const result = await dismissReport(
        postId,
        user?.id ?? null,
        targetReport?.post.epsuId ?? null,
        targetReport?.post.authorId ?? null
      );
      setReports((current) => current.filter((report) => report.post.id !== postId));
      return result;
    } catch {
      return { ok: false };
    }
  };

  const handleRemoveReportedPost = async (postId) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const targetReport = reports.find((report) => report.post.id === postId);
      const result = await removeReportedPost(
        postId,
        user?.id ?? null,
        targetReport?.post.epsuId ?? null,
        targetReport?.post.authorId ?? null
      );
      setReports((current) => current.filter((report) => report.post.id !== postId));
      setPosts((current) => current.filter((post) => post.id !== postId));
      return result;
    } catch {
      return { ok: false };
    }
  };

  const handleMuteReportedAuthor = async (postId, profileId, epsuId) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const result = await muteReportedAuthor(profileId, epsuId, postId, user?.id ?? null);
      setReports((current) => current.filter((report) => report.post.id !== postId));
      return result;
    } catch {
      return { ok: false };
    }
  };

  const handlePromoteMember = async (membershipId) => {
    try {
      const result = await updateMembershipRole(membershipId, 'moderator');
      setMemberships((current) =>
        current.map((membership) =>
          membership.id === membershipId ? { ...membership, role: 'moderator' } : membership
        )
      );
      return result;
    } catch {
      return { ok: false };
    }
  };

  const handleDemoteModerator = async (membershipId) => {
    try {
      const result = await updateMembershipRole(membershipId, 'member');
      setMemberships((current) =>
        current.map((membership) =>
          membership.id === membershipId ? { ...membership, role: 'member' } : membership
        )
      );
      return result;
    } catch {
      return { ok: false };
    }
  };

  const handleDeleteEpsu = async (epsuId) => {
    try {
      const result = await deleteEpsu(epsuId);
      setEpsus((current) => current.filter((epsu) => epsu.id !== epsuId));
      setPosts((current) => current.filter((post) => post.epsuId !== epsuId));
      setReports((current) => current.filter((report) => report.post.epsuId !== epsuId));
      setMemberships((current) => current.filter((membership) => membership.epsuId !== epsuId));
      setModeratedEpsuIds((current) => current.filter((id) => id !== epsuId));
      setOwnedEpsuIds((current) => current.filter((id) => id !== epsuId));
      return result;
    } catch {
      return { ok: false };
    }
  };

  if (!isReady) {
    return <View style={{ flex: 1, backgroundColor: '#e52b50' }} />;
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        {isAuthenticated ? (
          <MainTabs
            onLogout={handleLogout}
            onSubmitPost={handleSubmitPost}
            epsus={epsus}
            posts={posts}
            reviewedPostIdsByEpsu={reviewedPostIdsByEpsu}
            reportedPostIds={reportedPostIds}
            onReactToPost={handleReactToPost}
            onReportPost={handleReportPost}
            moderatedEpsuIds={moderatedEpsuIds}
            ownedEpsuIds={ownedEpsuIds}
            reports={reports}
            memberships={memberships}
            onDismissReport={handleDismissReport}
            onRemoveReportedPost={handleRemoveReportedPost}
            onMuteReportedAuthor={handleMuteReportedAuthor}
            onPromoteMember={handlePromoteMember}
            onDemoteModerator={handleDemoteModerator}
            onDeleteEpsu={handleDeleteEpsu}
            currentUsername={currentUsername}
            currentEmail={currentEmail}
            currentPasswordLength={currentPasswordLength}
            notificationsEnabled={notificationsEnabled}
            onToggleNotifications={handleToggleNotifications}
            onChangePassword={handleChangePassword}
            onDeleteAccount={handleDeleteAccount}
          />
        ) : (
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: '#e52b50' },
            }}
          >
            <Stack.Screen name="Login">
              {(props) => <LoginScreen {...props} onLogin={handleLogin} />}
            </Stack.Screen>
            <Stack.Screen name="SignUp">
              {(props) => <SignUpScreen {...props} onSignUp={handleSignUp} />}
            </Stack.Screen>
          </Stack.Navigator>
        )}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
