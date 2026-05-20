import React, { useEffect, useMemo, useState } from 'react';
import { Image, ImageBackground, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import LoginScreen from './LoginScreen';
import SignUpScreen from './SignUpScreen';
import GuestModeScreen from './GuestModeScreen';
import ForgotPasswordScreen from './ForgotPasswordScreen';
import ResetPasswordScreen from './ResetPasswordScreen';
import HomeScreen from './HomeScreen';
import ModQueueScreen from './ModQueueScreen';
import ModerationRecordsScreen from './ModerationRecordsScreen';
import OwnerToolsScreen from './OwnerToolsScreen';
import OwnerTeamScreen from './OwnerTeamScreen';
import OwnerWorstUsersScreen from './OwnerWorstUsersScreen';
import OwnerModInviteScreen from './OwnerModInviteScreen';
import DeleteEpsuScreen from './DeleteEpsuScreen';
import JoinInviteScreen from './JoinInviteScreen';
import PostScreen from './PostScreen';
import ReportScreen from './ReportScreen';
import RentEpsuScreen from './RentEpsuScreen';
import SettingsScreen from './SettingsScreen';
import AdminScreen from './AdminScreen';
import AdminFullhourQueueScreen from './AdminFullhourQueueScreen';
import { AppProvider, useAppActions, useAppData, useAppSession } from './AppContext';
import { AppDialogHost, showAppDialog } from './components/AppDialog';
import { requireSupabase } from './lib/supabase';
import { createAccountActions } from './lib/createAccountActions';
import { createCommunityActions } from './lib/createCommunityActions';
import { resetSessionState, useAppBootstrap } from './lib/useAppBootstrap';
import { useAppNotifications } from './lib/useAppNotifications';
import { useEpsuPresence } from './lib/useEpsuPresence';
import { subscribeToNetworkState } from './lib/networkGuard';
import { fetchEpsuActivePostCounts, fetchModeratedEpsuIds, fetchHostedEpsuIds, redeemInvite } from './lib/api/epsus';
import { fetchGuestEpsuFeedPage, fetchGuestPostById, fetchGuestPosts, fetchPosts } from './lib/api/feed';
import { fetchFlaggedQueuedPostsForEpsu } from './lib/api/moderation';
import {
  fetchGuestEpsus,
  fetchEpsusWithCountry,
  fetchHiddenEpsuIds,
  fetchVisibleMemberships,
} from './lib/schoolApi';
import { addReviewedPostIdByEpsu } from './lib/appStateTransforms';

let NotificationsModule = null;
try {
  NotificationsModule = require('expo-notifications');
  NotificationsModule.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch {
  NotificationsModule = null;
}

const Stack = createNativeStackNavigator();
const HomeStack = createNativeStackNavigator();
const SettingsStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const PENDING_MOD_INVITE_STORAGE_KEY = 'epsu_pending_mod_invite_token';
const INTRO_COMPLETED_STORAGE_KEY = 'has_completed_intro_v1';
const GUEST_MODE_REMAINING_SECONDS_STORAGE_KEY = 'epsu_guest_mode_remaining_seconds_v1';
const LAST_GUEST_COUNTRY_CODE_STORAGE_KEY = 'epsu_last_guest_country_code_v1';
const FEED_REFRESH_FALLBACK_MS = 300000;
const GUEST_MODE_DURATION_SECONDS = 60;

function IntroBurgerScreen({ navigation }) {
  return (
    <IntroOnboardingScreen
      title="Welcome!"
      subtitle=""
      imageSource={require('./assets/images/1774535505571.jpg')}
      sections={[
        { label: 'What is this?', answer: 'Epsus are anonymous local communities for schools and regions' },
        { label: 'Who is this for?', answer: 'People who want secure & honest local posting' },
        { label: 'Who made this?', answer: 'Built by a student who values your privacy' },
      ]}
      primaryLabel="Continue"
      onPrimaryPress={() => navigation.navigate('IntroPizza')}
    />
  );
}

function IntroPizzaScreen({ onCompleteIntro }) {
  return (
    <IntroOnboardingScreen
      title="Let's be friends!"
      subtitle=""
      imageSource={require('./assets/images/1774535505571.jpg')}
      cornerImageSource={require('./assets/images/1777127107648.jpg')}
      sections={[
        { label: 'Be safe', answer: 'Protect yourself and others from harm' },
        { label: 'Be nice', answer: 'Disagree without cruelty or humiliation' },
        { label: 'Be real', answer: 'Post honestly without bullying or baiting' },
      ]}
      primaryLabel="Understood"
      onPrimaryPress={onCompleteIntro}
    />
  );
}

function IntroOnboardingScreen({
  title,
  subtitle,
  sections,
  primaryLabel,
  onPrimaryPress,
  imageSource,
  cornerImageSource,
}) {
  return (
    <ImageBackground
      source={imageSource}
      style={introStyles.background}
      resizeMode="cover"
    >
      <View style={introStyles.overlay}>
        <View style={introStyles.card}>
          <View style={introStyles.headerRow}>
            <View style={introStyles.headerTextColumn}>
              <Text style={introStyles.title}>{title}</Text>
              <Text style={introStyles.subtitle}>{subtitle}</Text>
            </View>
            {cornerImageSource ? (
              <Image source={cornerImageSource} style={introStyles.cornerImage} resizeMode="cover" />
            ) : null}
          </View>
          <View style={introStyles.sectionList}>
            {sections.map((section) => (
              <View key={section.label} style={introStyles.sectionBlock}>
                <Text style={introStyles.sectionLabel}>{section.label}</Text>
                <Text style={introStyles.answerText}>{section.answer}</Text>
              </View>
            ))}
          </View>
          <View style={introStyles.buttonRow}>
            <Pressable style={introStyles.button} onPress={onPrimaryPress}>
              <Text style={introStyles.buttonText}>{primaryLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </ImageBackground>
  );
}

const introStyles = StyleSheet.create({
  background: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingVertical: 22,
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 14,
  },
  headerTextColumn: {
    flex: 1,
  },
  title: {
    color: '#1f1f1f',
    fontSize: 34,
    fontWeight: '800',
  },
  subtitle: {
    color: '#5c5c5c',
    fontSize: 16,
    lineHeight: 22,
    marginTop: 0,
  },
  cornerImage: {
    borderRadius: 14,
    height: 88,
    marginTop: 2,
    width: 88,
  },
  sectionList: {
    marginTop: 0,
  },
  sectionBlock: {
    marginBottom: 12,
  },
  sectionLabel: {
    color: '#e52b50',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  answerText: {
    color: '#363636',
    fontSize: 15,
    lineHeight: 22,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#e52b50',
    borderRadius: 16,
    flex: 1,
    paddingVertical: 15,
  },
  secondaryButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#f1b6c2',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButtonText: {
    color: '#e52b50',
  },
});

function getMsUntilNextUtcHour(now = Date.now()) {
  const nextHour = new Date(now);
  nextHour.setUTCMinutes(0, 0, 250);
  nextHour.setUTCHours(nextHour.getUTCHours() + 1);
  return Math.max(250, nextHour.getTime() - now);
}

function getDeepLinkParams(url) {
  const params = new URLSearchParams();
  const queryStart = url.indexOf('?');
  const hashStart = url.indexOf('#');

  [queryStart, hashStart]
    .filter((index) => index >= 0)
    .forEach((index) => {
      url.slice(index + 1)
        .split('&')
        .forEach((pair) => {
          const [key, rawValue = ''] = pair.split('=');
          if (key) {
            params.set(decodeURIComponent(key), decodeURIComponent(rawValue.replace(/\+/g, ' ')));
          }
        });
    });

  return params;
}

function getModeratorInviteToken(url) {
  if (!url) {
    return null;
  }

  const params = getDeepLinkParams(url);
  const queryToken = params.get('token');
  if (queryToken) {
    return queryToken;
  }

  const modInviteMatch = url.match(/mod-invite\/([^?#/]+)/i);
  if (modInviteMatch?.[1]) {
    return decodeURIComponent(modInviteMatch[1]);
  }

  const modPathMatch = url.match(/\/mod(?:\/|\.html(?:\?|#|$)|\?)([^?#/]*)/i);
  if (modPathMatch?.[1]) {
    return decodeURIComponent(modPathMatch[1]);
  }

  return null;
}

function logModeratorInvite(message, details = null) {
  if (details == null) {
    console.log(`[mod-invite] ${message}`);
    return;
  }

  const normalizedDetails = typeof details === 'string'
    ? details
    : JSON.stringify(details);
  console.log(`[mod-invite] ${message} ${normalizedDetails}`);
}

async function storePendingModeratorInviteToken(token) {
  if (!token) {
    return;
  }

  await AsyncStorage.setItem(PENDING_MOD_INVITE_STORAGE_KEY, token);
  logModeratorInvite('stored pending token', { tokenPrefix: token.slice(0, 8) });
}

async function clearPendingModeratorInviteToken(expectedToken = null) {
  if (expectedToken) {
    const storedToken = await AsyncStorage.getItem(PENDING_MOD_INVITE_STORAGE_KEY).catch(() => null);
    if (storedToken && storedToken !== expectedToken) {
      logModeratorInvite('skipped clearing pending token because a newer token is stored', {
        expectedTokenPrefix: expectedToken.slice(0, 8),
        storedTokenPrefix: storedToken.slice(0, 8),
      });
      return false;
    }
  }

  await AsyncStorage.removeItem(PENDING_MOD_INVITE_STORAGE_KEY);
  logModeratorInvite('cleared pending token', {
    expectedTokenPrefix: expectedToken ? expectedToken.slice(0, 8) : null,
  });
  return true;
}

function PostTabIcon({ focused }) {
  return (
    <Ionicons
      name={focused ? 'add-circle' : 'add-circle-outline'}
      size={24}
      color="#fff"
    />
  );
}

function formatGuestCountdown(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = String(Math.floor(safeSeconds / 60)).padStart(1, '0');
  const seconds = String(safeSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function GuestTimerBadge({ secondsLeft }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 14,
        right: 18,
        zIndex: 10,
        minWidth: 92,
        borderRadius: 999,
        backgroundColor: '#e52b50',
        paddingHorizontal: 18,
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 12,
        elevation: 8,
      }}
    >
      <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 0.6 }}>
        {formatGuestCountdown(secondsLeft)}
      </Text>
    </View>
  );
}

function HomeBaseScreen(props) {
  const data = useAppData();
  const actions = useAppActions();
  const session = useAppSession();

  return (
    <HomeScreen
      {...props}
      epsus={data.epsus}
      posts={data.posts}
      memberships={data.memberships}
      epsuPopulationById={data.epsuPopulationById}
      activePostCountByEpsu={data.activePostCountByEpsu}
      reviewedPostIdsByEpsu={data.reviewedPostIdsByEpsu}
      reportedPostIds={data.reportedPostIds}
      repliedToPostIds={data.repliedToPostIds}
      onReactToPost={actions.onReactToPost}
      onReportPost={actions.onReportPost}
      onBlockPostAuthor={actions.onBlockPostAuthor}
      moderatedEpsuIds={data.moderatedEpsuIds}
      hostedEpsuIds={data.hostedEpsuIds}
      userMemberships={data.userMemberships}
      hiddenEpsuIds={data.hiddenEpsuIds}
      blockedAuthorIds={data.blockedAuthorIds}
      onLeaveEpsu={actions.onLeaveEpsu}
      onJoinEpsu={actions.onJoinEpsu}
      onFetchEpsuFeedPage={actions.onFetchEpsuFeedPage}
      onFetchPostById={actions.onFetchPostById}
      currentCountryCode={session.currentCountryCode}
      currentIsAdmin={session.currentIsAdmin}
      isGuestMode={session.isGuestMode}
      onGuestLockedAction={actions.onGuestLockedAction}
    />
  );
}

function ModQueueBaseScreen(props) {
  const data = useAppData();
  const actions = useAppActions();

  return (
    <ModQueueScreen
      {...props}
      epsus={data.epsus}
      posts={data.posts}
      reports={data.reports}
      queuedFlaggedPosts={data.queuedFlaggedPosts}
      onDismissReport={actions.onDismissReport}
      onDismissQueuedPost={actions.onDismissQueuedPost}
      onRemoveReportedPost={actions.onRemoveReportedPost}
      onMuteReportedAuthor={actions.onMuteReportedAuthor}
    />
  );
}

function InvestigationScreenWrapper(props) {
  return <ModQueueBaseScreen {...props} mode="investigation" />;
}

function ModerationRecordsAppScreen(props) {
  const data = useAppData();
  return <ModerationRecordsScreen {...props} epsus={data.epsus} />;
}

function OwnerToolsAppScreen(props) {
  const data = useAppData();
  const session = useAppSession();
  return (
    <OwnerToolsScreen
      {...props}
      epsus={data.epsus}
      memberships={data.memberships}
      currentUserId={session.currentUserId}
      currentIsAdmin={session.currentIsAdmin}
    />
  );
}

function OwnerTeamAppScreen(props) {
  const data = useAppData();
  const actions = useAppActions();
  const session = useAppSession();

  return (
    <OwnerTeamScreen
      {...props}
      epsus={data.epsus}
      memberships={data.memberships}
      currentUserId={session.currentUserId}
      currentEmail={session.currentEmail}
      currentIsAdmin={session.currentIsAdmin}
      hostedEpsuIds={data.hostedEpsuIds}
      onDemoteModerator={actions.onDemoteModerator}
    />
  );
}

function OwnerWorstUsersAppScreen(props) {
  const data = useAppData();
  const actions = useAppActions();
  return <OwnerWorstUsersScreen {...props} epsus={data.epsus} onKickEpsuMember={actions.onKickEpsuMember} />;
}

function OwnerModInviteAppScreen(props) {
  const data = useAppData();
  const actions = useAppActions();
  return (
    <OwnerModInviteScreen
      {...props}
      epsus={data.epsus}
      onEnsureInvite={actions.onEnsureInvite}
      onFetchInviteStatus={actions.onFetchInviteStatus}
    />
  );
}

function JoinInviteAppScreen(props) {
  const session = useAppSession();
  const data = useAppData();
  const actions = useAppActions();
  return (
    <JoinInviteScreen
      {...props}
      currentCountryCode={session.currentCountryCode}
      currentIsAdmin={session.currentIsAdmin}
      epsus={data.epsus}
      userMemberships={data.userMemberships}
      onSubmitEpsuSuggestion={actions.onSubmitEpsuSuggestion}
    />
  );
}

function DeleteEpsuAppScreen(props) {
  const data = useAppData();
  const actions = useAppActions();
  return <DeleteEpsuScreen {...props} epsus={data.epsus} onDeleteEpsu={actions.onDeleteEpsu} />;
}

function ReportReasonAppScreen(props) {
  const actions = useAppActions();
  return <ReportScreen {...props} onSubmitReport={actions.onReportPost} />;
}

function RentEpsuAppScreen(props) {
  const session = useAppSession();
  const data = useAppData();
  const actions = useAppActions();
  return (
    <RentEpsuScreen
      {...props}
      currentIsAdmin={session.currentIsAdmin}
      epsus={data.epsus}
      userMemberships={data.userMemberships}
      onCreateSchoolEpsu={actions.onCreateSchoolEpsu}
    />
  );
}

function SettingsMainAppScreen(props) {
  const session = useAppSession();
  const actions = useAppActions();

  if (session.isGuestMode) {
    return null;
  }

  return (
    <SettingsScreen
      {...props}
      currentIsAdmin={session.currentIsAdmin}
      currentEmail={session.currentEmail}
      currentCountryCode={session.currentCountryCode}
      currentPasswordLength={session.currentPasswordLength}
      notificationsEnabled={session.notificationsEnabled}
      pushRegistrationStatus={session.pushRegistrationStatus}
      onRequestNotificationPermission={actions.onRequestNotificationPermission}
      onToggleNotifications={actions.onToggleNotifications}
      onLogout={actions.onLogout}
    />
  );
}

function ChangePasswordAppScreen(props) {
  const actions = useAppActions();
  return <SettingsScreen {...props} mode="change-password" onChangePassword={actions.onChangePassword} />;
}

function DeleteAccountAppScreen(props) {
  const actions = useAppActions();
  return (
    <SettingsScreen
      {...props}
      mode="delete-account"
      onDeleteAccount={actions.onDeleteAccount}
      onConfirmDeleteAccount={actions.onConfirmDeleteAccount}
    />
  );
}

function AccountHistoryAppScreen(props) {
  const actions = useAppActions();
  return (
    <SettingsScreen
      {...props}
      mode="account-history"
      onFetchAccountHistory={actions.onFetchAccountHistory}
    />
  );
}

function HelpAppScreen(props) {
  const session = useAppSession();
  return <SettingsScreen {...props} mode="help" currentCountryCode={session.currentCountryCode} />;
}

function AdminAppScreen(props) {
  const actions = useAppActions();

  return (
    <AdminScreen
      {...props}
      onReviewPendingSchoolEpsu={actions.onReviewPendingSchoolEpsu}
      onReviewRegionalEpsuSuggestion={actions.onReviewRegionalEpsuSuggestion}
      onReleaseQueuedPostsNow={actions.onReleaseQueuedPostsNow}
    />
  );
}

function AdminFullhourQueueAppScreen(props) {
  const data = useAppData();
  const actions = useAppActions();
  const session = useAppSession();

  return (
    <AdminFullhourQueueScreen
      {...props}
      mode={props.route?.name === 'AdminFullhourInvestigation' ? 'admin-investigation' : 'admin-queue'}
      currentUserId={session.currentUserId}
      epsus={data.epsus}
      posts={data.posts}
      reports={data.reports}
      queuedFlaggedPosts={data.queuedFlaggedPosts}
      onDismissReport={actions.onDismissReport}
      onDismissQueuedPost={actions.onDismissQueuedPost}
      onRemoveReportedPost={actions.onRemoveReportedPost}
      onMuteReportedAuthor={actions.onMuteReportedAuthor}
    />
  );
}

function PostAppScreen(props) {
  const actions = useAppActions();
  const session = useAppSession();
  const data = useAppData();
  return (
    <PostScreen
      {...props}
      onSubmitPost={actions.onSubmitPost}
      onAcceptCommunityGuidelines={actions.onAcceptCommunityGuidelines}
      hasAcceptedCommunityGuidelines={session.currentHasAcceptedCommunityGuidelines}
      epsus={data.epsus}
      userMemberships={data.userMemberships}
      currentUserId={session.currentUserId}
      isGuestMode={session.isGuestMode}
      onGuestLockedAction={actions.onGuestLockedAction}
      currentCountryCode={session.currentCountryCode}
    />
  );
}

function LoginAppScreen(props) {
  const actions = useAppActions();
  const session = useAppSession();
  return (
    <LoginScreen
      {...props}
      onLogin={actions.onLogin}
      showGuestModeBubble={session.hasLoadedGuestTime && session.guestSecondsLeft > 0}
    />
  );
}

function SignUpAppScreen(props) {
  const actions = useAppActions();
  const session = useAppSession();
  return (
    <SignUpScreen
      {...props}
      onSignUp={actions.onSignUp}
      showGuestModeBubble={session.hasLoadedGuestTime && session.guestSecondsLeft > 0}
    />
  );
}

function GuestModeAppScreen(props) {
  const actions = useAppActions();
  const session = useAppSession();

  return (
    <GuestModeScreen
      {...props}
      onStartGuestMode={actions.onStartGuestMode}
      initialCountryCode={session.guestCountryCode}
    />
  );
}

function ForgotPasswordAppScreen(props) {
  const actions = useAppActions();
  return <ForgotPasswordScreen {...props} onRequestPasswordReset={actions.onRequestPasswordReset} />;
}

function HomeStackScreen() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeMain" component={HomeBaseScreen} />
      <HomeStack.Screen name="HomeEpsu" component={HomeBaseScreen} />
      <HomeStack.Screen name="ModQueue" component={ModQueueBaseScreen} />
      <HomeStack.Screen name="Investigation" component={InvestigationScreenWrapper} />
      <HomeStack.Screen name="ModerationRecords" component={ModerationRecordsAppScreen} />
      <HomeStack.Screen name="OwnerTools" component={OwnerToolsAppScreen} />
      <HomeStack.Screen name="OwnerTeam" component={OwnerTeamAppScreen} />
      <HomeStack.Screen name="OwnerWorstUsers" component={OwnerWorstUsersAppScreen} />
      <HomeStack.Screen name="OwnerModInvite" component={OwnerModInviteAppScreen} />
      <HomeStack.Screen name="JoinInvite" component={JoinInviteAppScreen} />
      <HomeStack.Screen name="DeleteEpsu" component={DeleteEpsuAppScreen} />
      <HomeStack.Screen name="ReportReason" component={ReportReasonAppScreen} />
      <HomeStack.Screen name="RentEpsu" component={RentEpsuAppScreen} />
    </HomeStack.Navigator>
  );
}

function SettingsStackScreen() {
  const session = useAppSession();

  return (
    <SettingsStack.Navigator screenOptions={{ headerShown: false }}>
      <SettingsStack.Screen name="SettingsMain" component={SettingsMainAppScreen} />
      <SettingsStack.Screen name="ChangePassword" component={ChangePasswordAppScreen} />
      <SettingsStack.Screen name="DeleteAccount" component={DeleteAccountAppScreen} />
      <SettingsStack.Screen name="AccountHistory" component={AccountHistoryAppScreen} />
      <SettingsStack.Screen name="Help" component={HelpAppScreen} />
      {session.currentIsAdmin ? <SettingsStack.Screen name="Admin" component={AdminAppScreen} /> : null}
      {session.currentIsAdmin ? <SettingsStack.Screen name="AdminFullhourQueue" component={AdminFullhourQueueAppScreen} /> : null}
      {session.currentIsAdmin ? <SettingsStack.Screen name="AdminFullhourInvestigation" component={AdminFullhourQueueAppScreen} /> : null}
    </SettingsStack.Navigator>
  );
}

function MainTabs() {
  const insets = useSafeAreaInsets();
  const session = useAppSession();
  const actions = useAppActions();

  return (
    <View style={{ flex: 1 }}>
      {session.isGuestMode ? <GuestTimerBadge secondsLeft={session.guestSecondsLeft} /> : null}
      <Tab.Navigator
        initialRouteName="Home"
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
          component={PostAppScreen}
        />
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
              if (session.isGuestMode) {
                event.preventDefault();
                actions.onGuestLockedAction();
                return;
              }

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
    </View>
  );
}

function OfflineGate() {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#fff8fb',
        paddingTop: insets.top + 20,
        paddingHorizontal: 24,
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: '800', color: '#8d6676', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>
        Offline
      </Text>
      <Text style={{ fontSize: 32, fontWeight: '900', color: '#20131a', marginBottom: 12 }}>
        No connection
      </Text>
      <Text style={{ fontSize: 16, lineHeight: 24, color: '#7a5968', marginBottom: 20 }}>
        Epsu cannot be used without internet right now.
      </Text>
    </View>
  );
}

function BootScreen({ title = 'Opening Epsu', message = 'Preparing your app' }) {
  return (
    <ImageBackground
      source={require('./assets/images/1774535505571.jpg')}
      imageStyle={{
        opacity: 1,
        resizeMode: 'cover',
      }}
      style={{
        flex: 1,
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          paddingHorizontal: 28,
          backgroundColor: 'rgba(247,231,238,0.38)',
        }}
      >
        <Text
          style={{
            fontSize: 13,
            fontWeight: '800',
            color: '#7b3148',
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            marginBottom: 12,
          }}
        >
          Loading
        </Text>
        <Text style={{ fontSize: 32, fontWeight: '900', color: '#20131a', marginBottom: 12 }}>
          {title}
        </Text>
        <Text style={{ fontSize: 16, lineHeight: 24, color: '#5f3442', maxWidth: 320 }}>
          {message}
        </Text>
      </View>
    </ImageBackground>
  );
}

export default function App() {
  const supabase = requireSupabase();
  const handledFullhourNotificationIdsRef = React.useRef(new Set());
  const [fontsLoaded] = useFonts(Ionicons.font);
  const [hasCompletedIntro, setHasCompletedIntro] = useState(null);
  const [authEntryScreen, setAuthEntryScreen] = useState('Login');
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [guestCountryCode, setGuestCountryCode] = useState(null);
  const [guestSecondsLeft, setGuestSecondsLeft] = useState(GUEST_MODE_DURATION_SECONDS);
  const [hasLoadedGuestTime, setHasLoadedGuestTime] = useState(false);
  const [isGuestBootstrapping, setIsGuestBootstrapping] = useState(false);
  const [isGuestPromptOpen, setIsGuestPromptOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUsername, setCurrentUsername] = useState(null);
  const [currentIsAdmin, setCurrentIsAdmin] = useState(false);
  const [currentEmail, setCurrentEmail] = useState(null);
  const [currentCountryCode, setCurrentCountryCode] = useState(null);
  const [currentHasAcceptedCommunityGuidelines, setCurrentHasAcceptedCommunityGuidelines] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [pushRegistrationStatus, setPushRegistrationStatus] = useState('idle');
  const [pushRegistrationMessage, setPushRegistrationMessage] = useState('');
  const [notificationDiagnostics, setNotificationDiagnostics] = useState([]);
  const [currentPasswordLength, setCurrentPasswordLength] = useState(8);
  const [isReady, setIsReady] = useState(false);
  const [epsus, setEpsus] = useState([]);
  const [posts, setPosts] = useState([]);
  const [reviewedPostIdsByEpsu, setReviewedPostIdsByEpsu] = useState({});
  const [reportedPostIds, setReportedPostIds] = useState([]);
  const [repliedToPostIds, setRepliedToPostIds] = useState([]);
  const [moderatedEpsuIds, setModeratedEpsuIds] = useState([]);
  const [hostedEpsuIds, setHostedEpsuIds] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [userMemberships, setUserMemberships] = useState([]);
  const [hiddenEpsuIds, setHiddenEpsuIds] = useState([]);
  const [reports, setReports] = useState([]);
  const [queuedFlaggedPosts, setQueuedFlaggedPosts] = useState([]);
  const [blockedAuthorIds, setBlockedAuthorIds] = useState([]);
  const [epsuPopulationById, setEpsuPopulationById] = useState({});
  const [activePostCountByEpsu, setActivePostCountByEpsu] = useState({});
  const [unreadAppNotifications, setUnreadAppNotifications] = useState([]);
  const [isShowingAppNotification, setIsShowingAppNotification] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [isCompletingAuthLink, setIsCompletingAuthLink] = useState(false);
  const [authRefreshNonce, setAuthRefreshNonce] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingModeratorInviteToken, setPendingModeratorInviteToken] = useState(null);
  const [isRedeemingModeratorInvite, setIsRedeemingModeratorInvite] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [bootMessage, setBootMessage] = useState('Preparing your app');
  const [hasHydratedAppData, setHasHydratedAppData] = useState(false);
  const isAuthenticatedRef = React.useRef(isAuthenticated);
  const pendingModeratorInviteTokenRef = React.useRef(pendingModeratorInviteToken);

  useEffect(() => {
    pendingModeratorInviteTokenRef.current = pendingModeratorInviteToken;
  }, [pendingModeratorInviteToken]);

  useEffect(() => {
    let isActive = true;

    Promise.all([
      AsyncStorage.getItem(GUEST_MODE_REMAINING_SECONDS_STORAGE_KEY),
      AsyncStorage.getItem(LAST_GUEST_COUNTRY_CODE_STORAGE_KEY),
    ])
      .then(([storedValue, storedCountryCode]) => {
        if (!isActive) {
          return;
        }

        const parsedValue = Number.parseInt(storedValue ?? '', 10);
        if (Number.isFinite(parsedValue) && parsedValue >= 0) {
          setGuestSecondsLeft(Math.min(GUEST_MODE_DURATION_SECONDS, parsedValue));
        } else {
          setGuestSecondsLeft(GUEST_MODE_DURATION_SECONDS);
        }
        setGuestCountryCode(storedCountryCode || null);
        setHasLoadedGuestTime(true);
      })
      .catch(() => {
        if (isActive) {
          setGuestSecondsLeft(GUEST_MODE_DURATION_SECONDS);
          setGuestCountryCode(null);
          setHasLoadedGuestTime(true);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  const resetGuestSession = React.useCallback(() => {
    setIsGuestMode(false);
    setIsGuestBootstrapping(false);
    setIsGuestPromptOpen(false);
    setCurrentCountryCode(null);
    setCurrentHasAcceptedCommunityGuidelines(false);
    setEpsus([]);
    setPosts([]);
    setReviewedPostIdsByEpsu({});
    setReportedPostIds([]);
    setModeratedEpsuIds([]);
    setHostedEpsuIds([]);
    setMemberships([]);
    setUserMemberships([]);
    setHiddenEpsuIds([]);
    setReports([]);
    setQueuedFlaggedPosts([]);
    setBlockedAuthorIds([]);
    setEpsuPopulationById({});
    setActivePostCountByEpsu({});
  }, []);

  const promptGuestSignup = React.useCallback(() => {
    if (isGuestPromptOpen) {
      return;
    }

    setIsGuestPromptOpen(true);
    showAppDialog(
      "You're a guest!",
      "You can't do that yet. Make an account now",
      [
        {
          text: 'Create account',
          onPress: () => {
            resetGuestSession();
            setAuthEntryScreen('SignUp');
          },
        },
      ],
      {
        dismissible: false,
        onClose: () => {
          setIsGuestPromptOpen(false);
        },
      }
    );
  }, [isGuestPromptOpen, resetGuestSession]);

  const handleStartGuestMode = React.useCallback((countryCode) => {
    if (guestSecondsLeft <= 0) {
      return;
    }

    setGuestCountryCode(countryCode);
    void AsyncStorage.setItem(LAST_GUEST_COUNTRY_CODE_STORAGE_KEY, countryCode).catch(() => {});
    setIsGuestPromptOpen(false);
    setIsGuestMode(true);
  }, [guestSecondsLeft]);

  const addNotificationDiagnostic = React.useCallback((event, details = null) => {
    const normalizedDetails = details == null
      ? null
      : typeof details === 'string'
        ? details
        : JSON.stringify(details);

    setNotificationDiagnostics((current) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        event,
        details: normalizedDetails,
        createdAt: new Date().toISOString(),
      },
      ...current,
    ].slice(0, 80));
  }, []);

  const handleCompleteIntro = React.useCallback(() => {
    setAuthEntryScreen('SignUp');
    setHasCompletedIntro(true);
    void AsyncStorage.setItem(INTRO_COMPLETED_STORAGE_KEY, 'true').catch(() => {});
  }, []);

  useEffect(() => {
    if (!isGuestMode || !guestCountryCode || !isOnline) {
      return undefined;
    }

    let isActive = true;

    const loadGuestSession = async () => {
      setIsGuestBootstrapping(true);

      try {
        const nextGuestEpsus = await fetchGuestEpsus(guestCountryCode);
        const nextPopulation = nextGuestEpsus.reduce((accumulator, epsu) => {
          accumulator[epsu.id] = {
            memberCount: epsu.member_count ?? 0,
            onlineCount: epsu.online_count ?? 0,
          };
          return accumulator;
        }, {});
        const normalizedGuestEpsus = nextGuestEpsus.map((epsu) => ({
          id: epsu.id,
          slug: epsu.slug,
          name: epsu.name,
          code: epsu.code,
          scope: epsu.scope,
          website: epsu.website,
          review_status: epsu.review_status,
          country_code: epsu.country_code,
          logo_path: epsu.logo_path,
        }));
        const guestMemberships = normalizedGuestEpsus.map((epsu) => ({
          id: `guest:${epsu.id}`,
          epsuId: epsu.id,
          profileId: 'guest',
          role: 'member',
          status: 'active',
          mutedUntil: null,
        }));
        const nextPosts = await fetchGuestPosts(normalizedGuestEpsus.map((epsu) => epsu.id));

        if (!isActive) {
          return;
        }

        setCurrentCountryCode(guestCountryCode);
        setCurrentHasAcceptedCommunityGuidelines(false);
        setEpsus(normalizedGuestEpsus);
        setPosts(nextPosts);
        setReviewedPostIdsByEpsu({});
        setReportedPostIds([]);
        setModeratedEpsuIds([]);
        setHostedEpsuIds([]);
        setMemberships([]);
        setUserMemberships(guestMemberships);
        setHiddenEpsuIds([]);
        setReports([]);
        setQueuedFlaggedPosts([]);
        setBlockedAuthorIds([]);
        setEpsuPopulationById(nextPopulation);
      } finally {
        if (isActive) {
          setIsGuestBootstrapping(false);
        }
      }
    };

    void loadGuestSession();

    return () => {
      isActive = false;
    };
  }, [guestCountryCode, isGuestMode, isOnline]);

  useEffect(() => {
    if (!isGuestMode) {
      return undefined;
    }

    if (guestSecondsLeft <= 0) {
      if (!isGuestPromptOpen) {
        promptGuestSignup();
      }
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      setGuestSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [guestSecondsLeft, isGuestMode, isGuestPromptOpen, promptGuestSignup]);

  useEffect(() => {
    if (!hasLoadedGuestTime) {
      return;
    }

    AsyncStorage.setItem(
      GUEST_MODE_REMAINING_SECONDS_STORAGE_KEY,
      String(Math.max(0, guestSecondsLeft))
    ).catch(() => {});
  }, [guestSecondsLeft, hasLoadedGuestTime]);

  useEffect(() => {
    let isActive = true;

    AsyncStorage.getItem(INTRO_COMPLETED_STORAGE_KEY)
      .then((storedValue) => {
        if (isActive) {
          setHasCompletedIntro(storedValue === 'true');
        }
      })
      .catch(() => {
        if (isActive) {
          setHasCompletedIntro(false);
        }
      });

    AsyncStorage.getItem(PENDING_MOD_INVITE_STORAGE_KEY)
      .then((storedToken) => {
        if (isActive && storedToken) {
          logModeratorInvite('loaded stored pending token on app start', { tokenPrefix: storedToken.slice(0, 8) });
          setPendingModeratorInviteToken(storedToken);
        }
      })
      .catch(() => {});

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      setAuthEntryScreen('Login');
    }
  }, [isAuthenticated]);

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  useEffect(() => {
    let isActive = true;
    const subscription = subscribeToNetworkState((nextIsOnline) => {
      if (isActive) {
        setIsOnline(nextIsOnline);
      }
    });

    return () => {
      isActive = false;
      subscription?.remove?.();
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    const handleAuthUrl = async (url) => {
      if (!url) {
        logModeratorInvite('handleAuthUrl skipped empty url');
        return;
      }

      logModeratorInvite('handleAuthUrl received', { url });

      const moderatorInviteToken = getModeratorInviteToken(url);
      if (moderatorInviteToken) {
        logModeratorInvite('token extracted from url', { tokenPrefix: moderatorInviteToken.slice(0, 8) });
        await storePendingModeratorInviteToken(moderatorInviteToken).catch(() => {});
        setPendingModeratorInviteToken(moderatorInviteToken);
        if (!isAuthenticatedRef.current) {
          logModeratorInvite('user not authenticated yet, prompting login');
          showAppDialog('Moderator invite', 'Log in to accept this moderator invite');
        }
        return;
      }

      const isResetPasswordUrl = url.includes('reset-password');
      const isSignupConfirmUrl = url.includes('auth/confirm');

      if (!isResetPasswordUrl && !isSignupConfirmUrl) {
        return;
      }

      const params = getDeepLinkParams(url);
      const errorDescription = params.get('error_description');
      const code = params.get('code');
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (errorDescription) {
        showAppDialog(isResetPasswordUrl ? 'Reset password' : 'Email confirmation', errorDescription);
        return;
      }

      if (isResetPasswordUrl && isActive) {
        setIsPasswordRecovery(true);
      }

      try {
        if (isSignupConfirmUrl && isActive) {
          setIsCompletingAuthLink(true);
        }

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            throw error;
          }
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            throw error;
          }
        } else {
          showAppDialog(
            isResetPasswordUrl ? 'Reset password' : 'Email confirmation',
            isResetPasswordUrl
              ? 'The reset link is missing recovery details'
              : 'The confirmation link is missing sign-in details'
          );
          return;
        }

        if (isActive) {
          setAuthRefreshNonce((current) => current + 1);
        }

      } catch (error) {
        if (isActive) {
          setIsCompletingAuthLink(false);
          if (isResetPasswordUrl) {
            setIsPasswordRecovery(false);
          }
        }
        showAppDialog(
          isResetPasswordUrl ? 'Reset password' : 'Email confirmation',
          error?.message ?? (isResetPasswordUrl ? 'Could not open this reset link' : 'Could not confirm this email')
        );
      }
    };

    Linking.getInitialURL().then((url) => {
      logModeratorInvite('Linking.getInitialURL resolved', { url: url ?? null });
      void handleAuthUrl(url);
    });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      logModeratorInvite('Linking url event', { url });
      void handleAuthUrl(url);
    });

    return () => {
      isActive = false;
      subscription.remove();
    };
  }, [supabase]);

  useEffect(() => {
    if (isAuthenticated && isCompletingAuthLink) {
      setIsCompletingAuthLink(false);
    }
  }, [isAuthenticated, isCompletingAuthLink]);

  useEffect(() => {
    if (
      !pendingModeratorInviteToken ||
      !isAuthenticated ||
      !currentUserId ||
      isRedeemingModeratorInvite
    ) {
      logModeratorInvite('redeem effect skipped', {
        hasToken: Boolean(pendingModeratorInviteToken),
        isAuthenticated,
        currentUserId,
        isRedeemingModeratorInvite,
      });
      return;
    }

    let isActive = true;

    const handleModeratorInvite = async () => {
      const tokenToRedeem = pendingModeratorInviteToken;
      logModeratorInvite('starting invite redemption', {
        tokenPrefix: tokenToRedeem.slice(0, 8),
        currentUserId,
      });
      setIsRedeemingModeratorInvite(true);

      try {
        const result = await redeemInvite({ token: tokenToRedeem });
        logModeratorInvite('redeemInvite returned', result ?? null);

        if (!result?.ok) {
          logModeratorInvite('redeemInvite reported failure', result ?? null);
          if (pendingModeratorInviteTokenRef.current === tokenToRedeem) {
            setPendingModeratorInviteToken(null);
          }
          await clearPendingModeratorInviteToken(tokenToRedeem).catch(() => {});
          if (!isActive) {
            logModeratorInvite('redeem flow became inactive before showing failure');
            return;
          }
          showAppDialog('Moderator invite', result?.message ?? 'This invite could not be used');
          return;
        }

        if (!isActive) {
          logModeratorInvite('redeem flow became inactive before handling success');
          if (pendingModeratorInviteTokenRef.current === tokenToRedeem) {
            setPendingModeratorInviteToken(null);
          }
          await clearPendingModeratorInviteToken(tokenToRedeem).catch(() => {});
          return;
        }

        const [
          nextEpsus,
          nextMemberships,
          nextHostedEpsuIds,
          nextModeratedEpsuIds,
          nextHiddenEpsuIds,
        ] = await Promise.all([
          fetchEpsusWithCountry(),
          fetchVisibleMemberships(currentUserId, { ensureAdminMemberships: currentIsAdmin }),
          fetchHostedEpsuIds(currentUserId),
          fetchModeratedEpsuIds(currentUserId),
          fetchHiddenEpsuIds(currentUserId),
        ]);
        const normalizedMemberships = nextMemberships;
        logModeratorInvite('post-redeem refresh finished', {
          epsuCount: nextEpsus.length,
          membershipCount: normalizedMemberships.length,
          moderatedEpsuCount: nextModeratedEpsuIds.length,
          targetEpsuId: result.epsuId ?? null,
        });

        if (!isActive) {
          logModeratorInvite('redeem flow became inactive after refresh');
          if (pendingModeratorInviteTokenRef.current === tokenToRedeem) {
            setPendingModeratorInviteToken(null);
          }
          await clearPendingModeratorInviteToken(tokenToRedeem).catch(() => {});
          return;
        }

        setEpsus(nextEpsus);
        setUserMemberships(normalizedMemberships);
        setHostedEpsuIds(nextHostedEpsuIds);
        setModeratedEpsuIds(nextModeratedEpsuIds);
        setHiddenEpsuIds(nextHiddenEpsuIds);

        const epsuName =
          nextEpsus.find((epsu) => epsu.id === result.epsuId)?.name ??
          'this Epsu';
        logModeratorInvite('moderator access granted in app state', {
          epsuId: result.epsuId ?? null,
          epsuName,
        });
        showAppDialog('Moderator access granted', `You are now a moderator in ${epsuName}`);
        if (pendingModeratorInviteTokenRef.current === tokenToRedeem) {
          setPendingModeratorInviteToken(null);
        }
        await clearPendingModeratorInviteToken(tokenToRedeem).catch(() => {});
      } catch (error) {
        if (!isActive) {
          logModeratorInvite('redeem flow error after inactive state', error?.message ?? String(error));
          return;
        }

        logModeratorInvite('redeem flow threw error', error?.message ?? String(error));
        showAppDialog('Moderator invite', error?.message ?? 'This invite could not be used');
        if (pendingModeratorInviteTokenRef.current === tokenToRedeem) {
          setPendingModeratorInviteToken(null);
        }
        await clearPendingModeratorInviteToken(tokenToRedeem).catch(() => {});
      } finally {
        logModeratorInvite('ending invite redemption', { isActive });
        setIsRedeemingModeratorInvite(false);
      }
    };

    void handleModeratorInvite();

    return () => {
      isActive = false;
    };
  }, [
    pendingModeratorInviteToken,
    isAuthenticated,
    currentUserId,
    isRedeemingModeratorInvite,
    setEpsus,
    setHiddenEpsuIds,
    setModeratedEpsuIds,
    setHostedEpsuIds,
    setUserMemberships,
    currentIsAdmin,
  ]);

  useAppBootstrap({
    supabase,
    isGuestMode,
    isOnline,
    setIsReady,
    setIsAuthenticated,
    setCurrentUserId,
    setCurrentUsername,
    setCurrentIsAdmin,
    setCurrentEmail,
    setCurrentCountryCode,
    setCurrentHasAcceptedCommunityGuidelines,
    setNotificationsEnabled,
    setCurrentPasswordLength,
    setEpsus,
    setPosts,
    setReviewedPostIdsByEpsu,
    setReportedPostIds,
    setRepliedToPostIds,
    setModeratedEpsuIds,
    setHostedEpsuIds,
    setMemberships,
    setUserMemberships,
    setHiddenEpsuIds,
    setReports,
    setEpsuPopulationById,
    setActivePostCountByEpsu,
    setUnreadAppNotifications,
    setIsShowingAppNotification,
    setIsBootstrapping,
    setBootMessage,
    setHasHydratedAppData,
    setQueuedFlaggedPosts,
    setBlockedAuthorIds,
    currentEmail,
    authRefreshNonce,
  });

  const {
    handleSignUp,
    handleLogin,
    handleRequestPasswordReset,
    handleCompletePasswordRecovery,
    handleLogout: rawHandleLogout,
    handleToggleNotifications,
    handleRequestNotificationPermission,
    handleChangePassword: rawHandleChangePassword,
    handleDeleteAccount,
    handleConfirmDeleteAccount,
    handleFetchAccountHistory,
    handleAcceptCommunityGuidelines,
  } = useMemo(
    () =>
      createAccountActions({
        supabase,
        notificationsModule: NotificationsModule,
        currentEmail,
        notificationsEnabled,
        setNotificationsEnabled,
        setCurrentPasswordLength,
        setCurrentHasAcceptedCommunityGuidelines,
      }),
    [
      supabase,
      currentEmail,
      notificationsEnabled,
      setNotificationsEnabled,
      setCurrentPasswordLength,
      setCurrentHasAcceptedCommunityGuidelines,
    ]
  );

  const applySignedOutUiState = React.useCallback(() => {
    setIsGuestMode(false);
    setIsGuestBootstrapping(false);
    setIsGuestPromptOpen(false);
    setAuthEntryScreen('Login');
    resetSessionState({
      setCurrentUsername,
      setCurrentIsAdmin,
      setCurrentUserId,
      setCurrentEmail,
      setCurrentCountryCode,
      setCurrentHasAcceptedCommunityGuidelines,
      setNotificationsEnabled,
      setEpsus,
      setPosts,
      setReviewedPostIdsByEpsu,
      setReportedPostIds,
      setRepliedToPostIds,
      setModeratedEpsuIds,
      setHostedEpsuIds,
      setMemberships,
      setUserMemberships,
      setHiddenEpsuIds,
      setReports,
      setEpsuPopulationById,
      setActivePostCountByEpsu,
      setUnreadAppNotifications,
      setIsShowingAppNotification,
      setIsAuthenticated,
      setIsBootstrapping,
      setBootMessage,
      setHasHydratedAppData,
      setQueuedFlaggedPosts,
      setBlockedAuthorIds,
    });
    setIsReady(true);
  }, [
    setBlockedAuthorIds,
    setBootMessage,
    setCurrentCountryCode,
    setCurrentEmail,
    setCurrentHasAcceptedCommunityGuidelines,
    setCurrentIsAdmin,
    setCurrentUserId,
    setCurrentUsername,
    setEpsuPopulationById,
    setEpsus,
    setHasHydratedAppData,
    setHiddenEpsuIds,
    setHostedEpsuIds,
    setIsAuthenticated,
    setIsBootstrapping,
    setIsReady,
    setIsShowingAppNotification,
    setMemberships,
    setModeratedEpsuIds,
    setNotificationsEnabled,
    setPosts,
    setQueuedFlaggedPosts,
    setReportedPostIds,
    setReports,
    setReviewedPostIdsByEpsu,
    setUnreadAppNotifications,
    setUserMemberships,
    setActivePostCountByEpsu,
  ]);

  const handleLogout = React.useCallback(async () => {
    try {
      await rawHandleLogout();
      applySignedOutUiState();
    } catch (error) {
      showAppDialog('Log out', error?.message ?? 'Could not log out');
    }
  }, [applySignedOutUiState, rawHandleLogout]);

  const handleChangePassword = React.useCallback(async (payload) => {
    const result = await rawHandleChangePassword(payload);
    if (!result?.ok) {
      return result;
    }

    try {
      await rawHandleLogout();
    } catch {
      // If the provider already invalidated the session, the local UI still needs to move to signed-out state.
    }

    applySignedOutUiState();
    showAppDialog('Change password', 'Password changed. Log in with your new password.');

    return {
      ok: true,
      message: 'Password changed. Log in with your new password.',
    };
  }, [applySignedOutUiState, rawHandleChangePassword, rawHandleLogout]);

  useAppNotifications({
    currentUserId,
    currentIsAdmin,
    isAuthenticated,
    allowNotificationPrompts: !isPasswordRecovery,
    isOnline,
    notificationsEnabled,
    notificationsModule: NotificationsModule,
    handleToggleNotifications,
    unreadAppNotifications,
    isShowingAppNotification,
    setUnreadAppNotifications,
    setIsShowingAppNotification,
    setEpsus,
    setUserMemberships,
    setHostedEpsuIds,
    setModeratedEpsuIds,
    setPushRegistrationStatus,
    setPushRegistrationMessage,
    addNotificationDiagnostic,
  });

  useEffect(() => {
    if (!isAuthenticated || !isOnline || unreadAppNotifications.length === 0) {
      return undefined;
    }

    const nextFullhourNotifications = unreadAppNotifications.filter(
      (notification) =>
        notification?.kind === 'fullhour_post' &&
        notification?.id &&
        !handledFullhourNotificationIdsRef.current.has(notification.id)
    );

    if (nextFullhourNotifications.length === 0) {
      return undefined;
    }

    nextFullhourNotifications.forEach((notification) => {
      handledFullhourNotificationIdsRef.current.add(notification.id);
    });

    const activeMembershipEpsuIds = userMemberships
      .filter((membership) => membership.status === 'active' || membership.status === 'muted')
      .map((membership) => membership.epsuId);

    let isActive = true;

    void Promise.all([
      fetchPosts(activeMembershipEpsuIds),
      fetchEpsuActivePostCounts(epsus.map((epsu) => epsu.id)).catch(() => ({})),
    ])
      .then(([nextPosts, nextActivePostCountByEpsu]) => {
        if (!isActive) {
          return;
        }

        setPosts(nextPosts);
        setActivePostCountByEpsu(nextActivePostCountByEpsu);
        addNotificationDiagnostic('fullhour_post_feed_refresh', {
          notifications: nextFullhourNotifications.length,
          posts: nextPosts.length,
        });
      })
      .catch((error) => {
        addNotificationDiagnostic('fullhour_post_feed_refresh_failed', error?.message ?? String(error));
      });

    return () => {
      isActive = false;
    };
  }, [
    isAuthenticated,
    isOnline,
    unreadAppNotifications,
    userMemberships,
    epsus,
    addNotificationDiagnostic,
  ]);

  useEpsuPresence({
    currentUserId,
    epsus,
    hasHydratedAppData,
    isAuthenticated,
    isBootstrapping,
    isReady,
    isOnline,
    userMemberships,
    setEpsuPopulationById,
  });

  useEffect(() => {
    if (!isOnline || !hasHydratedAppData) {
      return undefined;
    }

    let isActive = true;
    let refreshTimeout = null;

    const refreshEpsuDirectory = async () => {
      try {
        if (isGuestMode && guestCountryCode) {
          const nextGuestEpsus = await fetchGuestEpsus(guestCountryCode);
          const nextActivePostCountByEpsu = await fetchEpsuActivePostCounts(
            nextGuestEpsus.map((epsu) => epsu.id)
          ).catch(() => ({}));

          if (!isActive) {
            return;
          }

          setEpsus(nextGuestEpsus);
          setActivePostCountByEpsu(nextActivePostCountByEpsu);
          return;
        }

        if (!isAuthenticated || !currentUserId) {
          return;
        }

        const [
          nextEpsus,
          nextMemberships,
          nextHostedEpsuIds,
          nextModeratedEpsuIds,
          nextHiddenEpsuIds,
        ] = await Promise.all([
          fetchEpsusWithCountry(),
          fetchVisibleMemberships(currentUserId, { ensureAdminMemberships: currentIsAdmin }),
          fetchHostedEpsuIds(currentUserId),
          fetchModeratedEpsuIds(currentUserId),
          fetchHiddenEpsuIds(currentUserId),
        ]);

        if (!isActive) {
          return;
        }

        setEpsus(nextEpsus);
        setUserMemberships(nextMemberships);
        setHostedEpsuIds(nextHostedEpsuIds);
        setModeratedEpsuIds(nextModeratedEpsuIds);
        setHiddenEpsuIds(nextHiddenEpsuIds);
        setActivePostCountByEpsu(await fetchEpsuActivePostCounts(nextEpsus.map((epsu) => epsu.id)).catch(() => ({})));
      } catch {
        return;
      }
    };

    const scheduleDirectoryRefresh = () => {
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }

      refreshTimeout = setTimeout(() => {
        refreshTimeout = null;
        void refreshEpsuDirectory();
      }, 500);
    };

    const channel = supabase
      .channel(`epsu-directory:${currentUserId ?? 'guest'}:${guestCountryCode ?? 'all'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'epsus',
        },
        () => {
          scheduleDirectoryRefresh();
        }
      )
      .subscribe();

    return () => {
      isActive = false;
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
      void supabase.removeChannel(channel);
    };
  }, [
    currentIsAdmin,
    currentUserId,
    guestCountryCode,
    hasHydratedAppData,
    isAuthenticated,
    isGuestMode,
    isOnline,
    supabase,
  ]);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) {
      return undefined;
    }

    let isActive = true;
    let hourBoundaryTimeout = null;
    let hourRetryTimeout = null;
    let refreshFeedTimeout = null;
    const activeMembershipEpsuIds = userMemberships
      .filter((membership) => membership.status === 'active' || membership.status === 'muted')
      .map((membership) => membership.epsuId);

    const refreshFeedContent = async () => {
      try {
        const [nextPosts, nextQueuedFlags, nextActivePostCountByEpsu] = await Promise.all([
          fetchPosts(activeMembershipEpsuIds).catch(() => []),
          Promise.all(
            moderatedEpsuIds.map((epsuId) => fetchFlaggedQueuedPostsForEpsu(epsuId).catch(() => []))
          ).catch(() => []),
          fetchEpsuActivePostCounts(epsus.map((epsu) => epsu.id)).catch(() => ({})),
        ]);

        if (!isActive) {
          return;
        }

        setPosts(nextPosts);
        setQueuedFlaggedPosts(nextQueuedFlags.flat());
        setActivePostCountByEpsu(nextActivePostCountByEpsu);
      } catch {
        return;
      }
    };

    const scheduleDebouncedFeedRefresh = (reason) => {
      if (refreshFeedTimeout) {
        clearTimeout(refreshFeedTimeout);
      }

      addNotificationDiagnostic('feed_realtime_refresh_scheduled', { reason });
      refreshFeedTimeout = setTimeout(() => {
        refreshFeedTimeout = null;
        void refreshFeedContent();
      }, 600);
    };

    const scheduleHourBoundaryRefresh = () => {
      hourBoundaryTimeout = setTimeout(() => {
        void refreshFeedContent();

        hourRetryTimeout = setTimeout(() => {
          void refreshFeedContent();
        }, 2500);

        scheduleHourBoundaryRefresh();
      }, getMsUntilNextUtcHour());
    };

    void refreshFeedContent();
    scheduleHourBoundaryRefresh();

    const realtimeChannels = [
      ...activeMembershipEpsuIds.map((epsuId) =>
        supabase
          .channel(`feed-posts:${currentUserId}:${epsuId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'posts',
              filter: `epsu_id=eq.${epsuId}`,
            },
            (payload) => {
              const record = payload.new ?? payload.old;
              if (!record) {
                return;
              }

              if (record.status === 'active' || record.status === 'queued' || payload.eventType === 'DELETE') {
                scheduleDebouncedFeedRefresh(`posts:${epsuId}:${payload.eventType}`);
              }
            }
          )
          .subscribe()
      ),
      ...moderatedEpsuIds.map((epsuId) =>
        supabase
          .channel(`feed-queued:${currentUserId}:${epsuId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'posts',
              filter: `epsu_id=eq.${epsuId}`,
            },
            (payload) => {
              const record = payload.new ?? payload.old;
              if (!record) {
                return;
              }

              if (record.status === 'queued') {
                scheduleDebouncedFeedRefresh(`queued:${epsuId}:${payload.eventType}`);
              }
            }
          )
          .subscribe()
      ),
    ];

    const interval = setInterval(() => {
      void refreshFeedContent();
    }, FEED_REFRESH_FALLBACK_MS);

    return () => {
      isActive = false;
      if (hourBoundaryTimeout) {
        clearTimeout(hourBoundaryTimeout);
      }
      if (hourRetryTimeout) {
        clearTimeout(hourRetryTimeout);
      }
      if (refreshFeedTimeout) {
        clearTimeout(refreshFeedTimeout);
      }
      clearInterval(interval);
      realtimeChannels.forEach((channel) => {
        void supabase.removeChannel(channel);
      });
    };
  }, [addNotificationDiagnostic, currentUserId, epsus, isAuthenticated, isOnline, moderatedEpsuIds, supabase, userMemberships]);

  const {
    handleSubmitPost,
    handleReactToPost,
    handleReportPost,
    handleBlockPostAuthor,
    handleDismissReport,
    handleDismissQueuedPost,
    handleRemoveReportedPost,
    handleMuteReportedAuthor,
    handleDemoteModerator,
    handleKickEpsuMember,
    handleDeleteEpsu,
    handleEnsureInvite,
    handleFetchInviteStatus,
    handleSubmitEpsuSuggestion,
    handleCreateSchoolEpsu,
    handleReviewPendingSchoolEpsu,
    handleReviewRegionalEpsuSuggestion,
    handleLeaveEpsu,
    handleJoinEpsu,
    handleReleaseQueuedPostsNow,
    handleFetchEpsuFeedPage,
    handleFetchPostById,
  } = useMemo(
    () =>
      createCommunityActions({
        supabase,
        epsus,
        posts,
        currentEmail,
        currentCountryCode,
        currentIsAdmin,
        userMemberships,
        moderatedEpsuIds,
        setPosts,
        setReviewedPostIdsByEpsu,
        setReportedPostIds,
        setRepliedToPostIds,
        setReports,
        setMemberships,
        setUserMemberships,
        setHostedEpsuIds,
        setModeratedEpsuIds,
        setEpsus,
        setEpsuPopulationById,
        setHiddenEpsuIds,
        setQueuedFlaggedPosts,
        setBlockedAuthorIds,
        setActivePostCountByEpsu,
      }),
    [
      supabase,
      epsus,
      posts,
      currentEmail,
      currentCountryCode,
      currentIsAdmin,
      userMemberships,
      moderatedEpsuIds,
      setPosts,
      setReviewedPostIdsByEpsu,
      setReportedPostIds,
      setRepliedToPostIds,
      setReports,
      setMemberships,
      setUserMemberships,
      setHostedEpsuIds,
      setModeratedEpsuIds,
      setEpsus,
      setEpsuPopulationById,
      setHiddenEpsuIds,
      setQueuedFlaggedPosts,
      setBlockedAuthorIds,
      setActivePostCountByEpsu,
    ]
  );

  const handleGuestLockedAction = React.useCallback(() => {
    promptGuestSignup();
  }, [promptGuestSignup]);

  const handleGuestReactToPost = React.useCallback((epsuId, postId) => {
    setReviewedPostIdsByEpsu((current) => addReviewedPostIdByEpsu(current, epsuId, postId));
    return { ok: true };
  }, []);

  const handleGuestFetchEpsuFeedPage = React.useCallback(async (epsuId, options = {}) => {
    try {
      return {
        ok: true,
        ...(await fetchGuestEpsuFeedPage(epsuId, options)),
      };
    } catch (error) {
      return {
        ok: false,
        message: error?.message ?? 'Could not load more posts',
        posts: [],
        hasMore: false,
        nextOffset: options.offset ?? 0,
      };
    }
  }, []);
  const handleGuestFetchPostById = React.useCallback(async (postId, epsuId = null) => {
    try {
      return {
        ok: true,
        post: await fetchGuestPostById(postId, epsuId),
      };
    } catch (error) {
      return {
        ok: false,
        message: error?.message ?? 'Could not load reply context',
        post: null,
      };
    }
  }, []);

  const sessionValue = useMemo(() => ({
    currentUserId,
    currentUsername,
    currentEmail,
    currentIsAdmin,
    currentCountryCode: isGuestMode ? guestCountryCode : currentCountryCode,
    currentHasAcceptedCommunityGuidelines,
    currentPasswordLength,
    notificationsEnabled,
    pushRegistrationStatus,
    pushRegistrationMessage,
    notificationDiagnostics,
    isGuestMode,
    guestCountryCode,
    guestSecondsLeft,
    hasLoadedGuestTime,
  }), [
    currentUserId,
    currentUsername,
    currentIsAdmin,
    currentEmail,
    currentCountryCode,
    guestCountryCode,
    currentHasAcceptedCommunityGuidelines,
    currentPasswordLength,
    notificationsEnabled,
    pushRegistrationStatus,
    pushRegistrationMessage,
    notificationDiagnostics,
    guestCountryCode,
    guestSecondsLeft,
    hasLoadedGuestTime,
    isGuestMode,
  ]);

  const dataValue = useMemo(() => ({
    epsus,
    posts,
    reviewedPostIdsByEpsu,
    reportedPostIds,
    repliedToPostIds,
    moderatedEpsuIds,
    hostedEpsuIds,
    reports,
    queuedFlaggedPosts,
    blockedAuthorIds,
    memberships,
    userMemberships,
    hiddenEpsuIds,
    epsuPopulationById,
    activePostCountByEpsu,
  }), [
    epsus,
    posts,
    reviewedPostIdsByEpsu,
    reportedPostIds,
    repliedToPostIds,
    moderatedEpsuIds,
    hostedEpsuIds,
    reports,
    queuedFlaggedPosts,
    blockedAuthorIds,
    memberships,
    userMemberships,
    hiddenEpsuIds,
    epsuPopulationById,
    activePostCountByEpsu,
  ]);

  const actionsValue = useMemo(() => ({
    onLogin: handleLogin,
    onSignUp: handleSignUp,
    onStartGuestMode: handleStartGuestMode,
    onGuestLockedAction: handleGuestLockedAction,
    onRequestPasswordReset: handleRequestPasswordReset,
    onCompletePasswordRecovery: handleCompletePasswordRecovery,
    onLogout: handleLogout,
    onSubmitPost: isGuestMode ? handleGuestLockedAction : handleSubmitPost,
    onReactToPost: isGuestMode ? handleGuestReactToPost : handleReactToPost,
    onReportPost: isGuestMode ? handleGuestLockedAction : handleReportPost,
    onBlockPostAuthor: isGuestMode ? handleGuestLockedAction : handleBlockPostAuthor,
    onDismissReport: handleDismissReport,
    onDismissQueuedPost: handleDismissQueuedPost,
    onRemoveReportedPost: handleRemoveReportedPost,
    onMuteReportedAuthor: handleMuteReportedAuthor,
    onDemoteModerator: handleDemoteModerator,
    onEnsureInvite: isGuestMode ? handleGuestLockedAction : handleEnsureInvite,
    onFetchInviteStatus: isGuestMode ? handleGuestLockedAction : handleFetchInviteStatus,
    onSubmitEpsuSuggestion: isGuestMode ? handleGuestLockedAction : handleSubmitEpsuSuggestion,
    onCreateSchoolEpsu: isGuestMode ? handleGuestLockedAction : handleCreateSchoolEpsu,
    onDeleteEpsu: handleDeleteEpsu,
    onJoinEpsu: isGuestMode ? handleGuestLockedAction : handleJoinEpsu,
    onReviewPendingSchoolEpsu: handleReviewPendingSchoolEpsu,
    onReviewRegionalEpsuSuggestion: handleReviewRegionalEpsuSuggestion,
    onLeaveEpsu: isGuestMode ? handleGuestLockedAction : handleLeaveEpsu,
    onKickEpsuMember: handleKickEpsuMember,
    onReleaseQueuedPostsNow: handleReleaseQueuedPostsNow,
    onFetchEpsuFeedPage: isGuestMode ? handleGuestFetchEpsuFeedPage : handleFetchEpsuFeedPage,
    onFetchPostById: isGuestMode ? handleGuestFetchPostById : handleFetchPostById,
    onRequestNotificationPermission: handleRequestNotificationPermission,
    onToggleNotifications: handleToggleNotifications,
    onChangePassword: handleChangePassword,
    onDeleteAccount: handleDeleteAccount,
    onConfirmDeleteAccount: handleConfirmDeleteAccount,
    onFetchAccountHistory: handleFetchAccountHistory,
    onAcceptCommunityGuidelines: handleAcceptCommunityGuidelines,
  }), [
    handleLogin,
    handleSignUp,
    handleStartGuestMode,
    handleGuestLockedAction,
    handleRequestPasswordReset,
    handleCompletePasswordRecovery,
    handleLogout,
    handleGuestReactToPost,
    handleSubmitPost,
    handleReactToPost,
    handleReportPost,
    handleBlockPostAuthor,
    handleDismissReport,
    handleDismissQueuedPost,
    handleRemoveReportedPost,
    handleMuteReportedAuthor,
    handleDemoteModerator,
    handleEnsureInvite,
    handleFetchInviteStatus,
    handleSubmitEpsuSuggestion,
    handleCreateSchoolEpsu,
    handleDeleteEpsu,
    handleJoinEpsu,
    handleReviewPendingSchoolEpsu,
    handleReviewRegionalEpsuSuggestion,
    handleLeaveEpsu,
    handleKickEpsuMember,
    handleReleaseQueuedPostsNow,
    handleGuestFetchEpsuFeedPage,
    handleGuestFetchPostById,
    handleFetchEpsuFeedPage,
    handleFetchPostById,
    handleRequestNotificationPermission,
    handleToggleNotifications,
    handleChangePassword,
    handleDeleteAccount,
    handleConfirmDeleteAccount,
    handleFetchAccountHistory,
    handleAcceptCommunityGuidelines,
    isGuestMode,
  ]);

  if (!isReady || !fontsLoaded || hasCompletedIntro == null) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <BootScreen message={bootMessage} />
          <AppDialogHost />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  if (isPasswordRecovery) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AppProvider sessionValue={sessionValue} dataValue={dataValue} actionsValue={actionsValue}>
            <ResetPasswordScreen
              onCompletePasswordRecovery={handleCompletePasswordRecovery}
              onDone={async () => {
                setIsPasswordRecovery(false);
                try {
                  await rawHandleLogout();
                } catch {
                  // Ignore cleanup errors here; the goal is to leave recovery mode signed out.
                } finally {
                  applySignedOutUiState();
                  showAppDialog('Reset password', 'Password updated. Log in with your new password.');
                }
              }}
            />
          </AppProvider>
          <AppDialogHost />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  if (isCompletingAuthLink) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <BootScreen title="Confirming your email" message="Signing you in to Epsu" />
          <AppDialogHost />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  if ((isAuthenticated && isBootstrapping && !hasHydratedAppData) || (isGuestMode && isGuestBootstrapping)) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <BootScreen title="Loading your space" message={bootMessage || 'Preparing your feed'} />
          <AppDialogHost />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  const showIntro = !isAuthenticated && !isGuestMode && !hasCompletedIntro;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProvider sessionValue={sessionValue} dataValue={dataValue} actionsValue={actionsValue}>
          {!isOnline ? (
            <OfflineGate />
          ) : (
            <NavigationContainer>
              {isAuthenticated || isGuestMode ? (
                <MainTabs />
              ) : showIntro ? (
                <Stack.Navigator
                  key="intro-stack"
                  initialRouteName="IntroBurger"
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: '#e52b50' },
                  }}
                >
                  <Stack.Screen name="IntroBurger" component={IntroBurgerScreen} />
                  <Stack.Screen name="IntroPizza">
                    {(props) => <IntroPizzaScreen {...props} onCompleteIntro={handleCompleteIntro} />}
                  </Stack.Screen>
                </Stack.Navigator>
              ) : (
                <Stack.Navigator
                  key={`auth-${authEntryScreen}`}
                  initialRouteName={authEntryScreen}
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: '#e52b50' },
                  }}
                >
                  <Stack.Screen name="Login" component={LoginAppScreen} />
                  <Stack.Screen name="ForgotPassword" component={ForgotPasswordAppScreen} />
                  <Stack.Screen name="SignUp" component={SignUpAppScreen} />
                  <Stack.Screen name="GuestMode" component={GuestModeAppScreen} />
                </Stack.Navigator>
              )}
            </NavigationContainer>
          )}
        </AppProvider>
        <AppDialogHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
