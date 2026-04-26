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
import { AppProvider, useAppActions, useAppData, useAppSession } from './AppContext';
import { AppDialogHost, showAppDialog } from './components/AppDialog';
import { requireSupabase } from './lib/supabase';
import { createAccountActions } from './lib/createAccountActions';
import { createCommunityActions } from './lib/createCommunityActions';
import { useAppBootstrap } from './lib/useAppBootstrap';
import { useAppNotifications } from './lib/useAppNotifications';
import { useEpsuPresence } from './lib/useEpsuPresence';
import { subscribeToNetworkState } from './lib/networkGuard';
import { fetchModeratedEpsuIds, fetchHostedEpsuIds, redeemInvite } from './lib/api/epsus';
import { fetchPosts } from './lib/api/feed';
import { fetchFlaggedQueuedPostsForEpsu } from './lib/api/moderation';
import {
  fetchEpsusWithCountry,
  fetchHiddenEpsuIds,
  fetchVisibleMemberships,
} from './lib/schoolApi';

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
const FEED_REFRESH_FALLBACK_MS = 60000;

function IntroInfoScreen({
  title,
  subtitle,
  sections,
  primaryLabel,
  onPrimaryPress,
  secondaryLabel,
  onSecondaryPress,
  imageSource,
}) {
  return (
    <ImageBackground
      source={imageSource}
      style={introStyles.background}
      resizeMode="cover"
    >
      <View style={introStyles.overlay}>
        <View style={introStyles.card}>
          <Text style={introStyles.title}>{title}</Text>
          <Text style={introStyles.subtitle}>{subtitle}</Text>

            <Text style={introStyles.sectionLabel}>Ingredients</Text>
            {ingredients.map((item) => (
              <Text key={item} style={introStyles.recipeLine}>• {item}</Text>
            ))}

            <Text style={[introStyles.sectionLabel, introStyles.stepsLabel]}>Steps</Text>
            {steps.map((item, index) => (
              <Text key={item} style={introStyles.recipeLine}>{index + 1}. {item}</Text>
            ))}
          <View style={introStyles.buttonRow}>
            {secondaryLabel ? (
              <Pressable style={[introStyles.button, introStyles.secondaryButton]} onPress={onSecondaryPress}>
                <Text style={[introStyles.buttonText, introStyles.secondaryButtonText]}>{secondaryLabel}</Text>
              </Pressable>
            ) : null}
            <Pressable style={introStyles.button} onPress={onPrimaryPress}>
              <Text style={introStyles.buttonText}>{primaryLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </ImageBackground>
  );
}

function IntroBurgerScreen({ navigation }) {
  return (
    <IntroOnboardingScreen
      title="Welcome!"
      subtitle=""
      imageSource={require('./assets/images/1774535505571.jpg')}
      sections={[
        { label: 'What is this', answer: "Anonymous local Epsu's for your school and regions" },
        { label: 'Who is this for', answer: 'People who want honest local conversations' },
        { label: 'Why use this', answer: 'To talk without fear of discrimination or hate' },
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
  const match = url?.match(/mod-invite\/([^?#/]+)/i);
  if (!match?.[1]) {
    return null;
  }

  return decodeURIComponent(match[1]);
}

async function storePendingModeratorInviteToken(token) {
  if (!token) {
    return;
  }

  await AsyncStorage.setItem(PENDING_MOD_INVITE_STORAGE_KEY, token);
}

async function clearPendingModeratorInviteToken() {
  await AsyncStorage.removeItem(PENDING_MOD_INVITE_STORAGE_KEY);
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
      reviewedPostIdsByEpsu={data.reviewedPostIdsByEpsu}
      reportedPostIds={data.reportedPostIds}
      onReactToPost={actions.onReactToPost}
      onReportPost={actions.onReportPost}
      onBlockPostAuthor={actions.onBlockPostAuthor}
      moderatedEpsuIds={data.moderatedEpsuIds}
      hostedEpsuIds={data.hostedEpsuIds}
      userMemberships={data.userMemberships}
      hiddenEpsuIds={data.hiddenEpsuIds}
      blockedAuthorIds={data.blockedAuthorIds}
      onLeaveSchoolEpsu={actions.onLeaveSchoolEpsu}
      onJoinRegionalEpsu={actions.onJoinRegionalEpsu}
      currentCountryCode={session.currentCountryCode}
      currentIsAdmin={session.currentIsAdmin}
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
  return <OwnerWorstUsersScreen {...props} epsus={data.epsus} onKickSchoolMember={actions.onKickSchoolMember} />;
}

function OwnerModInviteAppScreen(props) {
  const data = useAppData();
  const actions = useAppActions();
  return <OwnerModInviteScreen {...props} epsus={data.epsus} onEnsureInvite={actions.onEnsureInvite} />;
}

function JoinInviteAppScreen(props) {
  const actions = useAppActions();
  return <JoinInviteScreen {...props} onSubmitEpsuSuggestion={actions.onSubmitEpsuSuggestion} />;
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
  const actions = useAppActions();
  return <RentEpsuScreen {...props} onCreateSchoolEpsu={actions.onCreateSchoolEpsu} />;
}

function SettingsMainAppScreen(props) {
  const session = useAppSession();
  const actions = useAppActions();

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
    />
  );
}

function LoginAppScreen(props) {
  const actions = useAppActions();
  return <LoginScreen {...props} onLogin={actions.onLogin} />;
}

function SignUpAppScreen(props) {
  const actions = useAppActions();
  return <SignUpScreen {...props} onSignUp={actions.onSignUp} />;
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
    </SettingsStack.Navigator>
  );
}

function MainTabs() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }}>
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
  const [moderatedEpsuIds, setModeratedEpsuIds] = useState([]);
  const [hostedEpsuIds, setHostedEpsuIds] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [userMemberships, setUserMemberships] = useState([]);
  const [hiddenEpsuIds, setHiddenEpsuIds] = useState([]);
  const [reports, setReports] = useState([]);
  const [queuedFlaggedPosts, setQueuedFlaggedPosts] = useState([]);
  const [blockedAuthorIds, setBlockedAuthorIds] = useState([]);
  const [epsuPopulationById, setEpsuPopulationById] = useState({});
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
        return;
      }

      const moderatorInviteToken = getModeratorInviteToken(url);
      if (moderatorInviteToken) {
        await storePendingModeratorInviteToken(moderatorInviteToken).catch(() => {});
        setPendingModeratorInviteToken(moderatorInviteToken);
        if (!isAuthenticated) {
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

        if (isResetPasswordUrl && isActive) {
          setIsPasswordRecovery(true);
        }

      } catch (error) {
        if (isActive) {
          setIsCompletingAuthLink(false);
        }
        showAppDialog(
          isResetPasswordUrl ? 'Reset password' : 'Email confirmation',
          error?.message ?? (isResetPasswordUrl ? 'Could not open this reset link' : 'Could not confirm this email')
        );
      }
    };

    Linking.getInitialURL().then((url) => {
      void handleAuthUrl(url);
    });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleAuthUrl(url);
    });

    return () => {
      isActive = false;
      subscription.remove();
    };
  }, [isAuthenticated, supabase]);

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
      return;
    }

    let isActive = true;

    const handleModeratorInvite = async () => {
      setIsRedeemingModeratorInvite(true);

      try {
        const result = await redeemInvite({ token: pendingModeratorInviteToken });

        if (!isActive) {
          return;
        }

        if (!result?.ok) {
          showAppDialog('Moderator invite', result?.message ?? 'This invite could not be used');
          setPendingModeratorInviteToken(null);
          await clearPendingModeratorInviteToken().catch(() => {});
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
          fetchVisibleMemberships(currentUserId),
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

        const epsuName =
          nextEpsus.find((epsu) => epsu.id === result.epsuId)?.name ??
          'this Epsu';
        showAppDialog('Moderator access granted', `You are now a moderator in ${epsuName}`);
        setPendingModeratorInviteToken(null);
        await clearPendingModeratorInviteToken().catch(() => {});
      } catch (error) {
        if (!isActive) {
          return;
        }

        showAppDialog('Moderator invite', error?.message ?? 'This invite could not be used');
        setPendingModeratorInviteToken(null);
        await clearPendingModeratorInviteToken().catch(() => {});
      } finally {
        if (isActive) {
          setIsRedeemingModeratorInvite(false);
        }
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
  ]);

  useAppBootstrap({
    supabase,
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
    setModeratedEpsuIds,
    setHostedEpsuIds,
    setMemberships,
    setUserMemberships,
    setHiddenEpsuIds,
    setReports,
    setEpsuPopulationById,
    setUnreadAppNotifications,
    setIsShowingAppNotification,
    setIsBootstrapping,
    setBootMessage,
    setHasHydratedAppData,
    setQueuedFlaggedPosts,
    setBlockedAuthorIds,
    authRefreshNonce,
  });

  const {
    handleSignUp,
    handleLogin,
    handleRequestPasswordReset,
    handleCompletePasswordRecovery,
    handleLogout,
    handleToggleNotifications,
    handleRequestNotificationPermission,
    handleChangePassword,
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

  useAppNotifications({
    currentUserId,
    isAuthenticated,
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

    void fetchPosts(activeMembershipEpsuIds)
      .then((nextPosts) => {
        if (!isActive) {
          return;
        }

        setPosts(nextPosts);
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
    addNotificationDiagnostic,
  ]);

  useEpsuPresence({
    epsus,
    isAuthenticated,
    isOnline,
    userMemberships,
    setEpsuPopulationById,
  });

  useEffect(() => {
    if (!isAuthenticated || !isOnline) {
      return undefined;
    }

    let isActive = true;
    let hourBoundaryTimeout = null;
    let hourRetryTimeout = null;

    const refreshFeedContent = async () => {
      try {
        const activeMembershipEpsuIds = userMemberships
          .filter((membership) => membership.status === 'active' || membership.status === 'muted')
          .map((membership) => membership.epsuId);
        const [nextPosts, nextQueuedFlags] = await Promise.all([
          fetchPosts(activeMembershipEpsuIds).catch(() => []),
          Promise.all(
            moderatedEpsuIds.map((epsuId) => fetchFlaggedQueuedPostsForEpsu(epsuId).catch(() => []))
          ).catch(() => []),
        ]);

        if (!isActive) {
          return;
        }

        setPosts(nextPosts);
        setQueuedFlaggedPosts(nextQueuedFlags.flat());
      } catch {
        return;
      }
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
      clearInterval(interval);
    };
  }, [isAuthenticated, isOnline, moderatedEpsuIds, userMemberships]);

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
    handleKickSchoolMember,
    handleDeleteEpsu,
    handleEnsureInvite,
    handleSubmitEpsuSuggestion,
    handleCreateSchoolEpsu,
    handleReviewSchoolApplication,
    handleReviewPendingSchoolEpsu,
    handleReviewRegionalEpsuSuggestion,
    handleSubmitSchoolApplication,
    handleLeaveSchoolEpsu,
    handleJoinRegionalEpsu,
    handleReleaseQueuedPostsNow,
  } = useMemo(
    () =>
      createCommunityActions({
        supabase,
        epsus,
        posts,
        currentEmail,
        currentCountryCode,
        userMemberships,
        moderatedEpsuIds,
        setPosts,
        setReviewedPostIdsByEpsu,
        setReportedPostIds,
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
      }),
    [
      supabase,
      epsus,
      posts,
      currentEmail,
      currentCountryCode,
      userMemberships,
      moderatedEpsuIds,
      setPosts,
      setReviewedPostIdsByEpsu,
      setReportedPostIds,
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
    ]
  );

  const sessionValue = useMemo(() => ({
    currentUserId,
    currentUsername,
    currentEmail,
    currentIsAdmin,
    currentCountryCode,
    currentHasAcceptedCommunityGuidelines,
    currentPasswordLength,
    notificationsEnabled,
    pushRegistrationStatus,
    pushRegistrationMessage,
    notificationDiagnostics,
  }), [
    currentUserId,
    currentUsername,
    currentIsAdmin,
    currentEmail,
    currentCountryCode,
    currentHasAcceptedCommunityGuidelines,
    currentPasswordLength,
    notificationsEnabled,
    pushRegistrationStatus,
    pushRegistrationMessage,
    notificationDiagnostics,
  ]);

  const dataValue = useMemo(() => ({
    epsus,
    posts,
    reviewedPostIdsByEpsu,
    reportedPostIds,
    moderatedEpsuIds,
    hostedEpsuIds,
    reports,
    queuedFlaggedPosts,
    blockedAuthorIds,
    memberships,
    userMemberships,
    hiddenEpsuIds,
    epsuPopulationById,
  }), [
    epsus,
    posts,
    reviewedPostIdsByEpsu,
    reportedPostIds,
    moderatedEpsuIds,
    hostedEpsuIds,
    reports,
    queuedFlaggedPosts,
    blockedAuthorIds,
    memberships,
    userMemberships,
    hiddenEpsuIds,
    epsuPopulationById,
  ]);

  const actionsValue = useMemo(() => ({
    onLogin: handleLogin,
    onSignUp: handleSignUp,
    onRequestPasswordReset: handleRequestPasswordReset,
    onCompletePasswordRecovery: handleCompletePasswordRecovery,
    onLogout: handleLogout,
    onSubmitPost: handleSubmitPost,
    onReactToPost: handleReactToPost,
    onReportPost: handleReportPost,
    onBlockPostAuthor: handleBlockPostAuthor,
    onSubmitSchoolApplication: handleSubmitSchoolApplication,
    onDismissReport: handleDismissReport,
    onDismissQueuedPost: handleDismissQueuedPost,
    onRemoveReportedPost: handleRemoveReportedPost,
    onMuteReportedAuthor: handleMuteReportedAuthor,
    onDemoteModerator: handleDemoteModerator,
    onEnsureInvite: handleEnsureInvite,
    onSubmitEpsuSuggestion: handleSubmitEpsuSuggestion,
    onCreateSchoolEpsu: handleCreateSchoolEpsu,
    onDeleteEpsu: handleDeleteEpsu,
    onJoinRegionalEpsu: handleJoinRegionalEpsu,
    onReviewPendingSchoolEpsu: handleReviewPendingSchoolEpsu,
    onReviewRegionalEpsuSuggestion: handleReviewRegionalEpsuSuggestion,
    onReviewSchoolApplication: handleReviewSchoolApplication,
    onLeaveSchoolEpsu: handleLeaveSchoolEpsu,
    onKickSchoolMember: handleKickSchoolMember,
    onReleaseQueuedPostsNow: handleReleaseQueuedPostsNow,
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
    handleRequestPasswordReset,
    handleCompletePasswordRecovery,
    handleLogout,
    handleSubmitPost,
    handleReactToPost,
    handleReportPost,
    handleBlockPostAuthor,
    handleSubmitSchoolApplication,
    handleDismissReport,
    handleDismissQueuedPost,
    handleRemoveReportedPost,
    handleMuteReportedAuthor,
    handleDemoteModerator,
    handleEnsureInvite,
    handleSubmitEpsuSuggestion,
    handleCreateSchoolEpsu,
    handleDeleteEpsu,
    handleJoinRegionalEpsu,
    handleReviewPendingSchoolEpsu,
    handleReviewRegionalEpsuSuggestion,
    handleReviewSchoolApplication,
    handleLeaveSchoolEpsu,
    handleKickSchoolMember,
    handleReleaseQueuedPostsNow,
    handleRequestNotificationPermission,
    handleToggleNotifications,
    handleChangePassword,
    handleDeleteAccount,
    handleConfirmDeleteAccount,
    handleFetchAccountHistory,
    handleAcceptCommunityGuidelines,
  ]);

  if (!isReady || !fontsLoaded || hasCompletedIntro == null) {
    return <BootScreen message={bootMessage} />;
  }

  if (isCompletingAuthLink) {
    return <BootScreen title="Confirming your email" message="Signing you in to Epsu" />;
  }

  if (isAuthenticated && isBootstrapping && !hasHydratedAppData) {
    return <BootScreen title="Loading your space" message={bootMessage || 'Preparing your feed'} />;
  }

  const showIntro = !isAuthenticated && !hasCompletedIntro;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProvider sessionValue={sessionValue} dataValue={dataValue} actionsValue={actionsValue}>
          {isPasswordRecovery ? (
            <ResetPasswordScreen
              onCompletePasswordRecovery={handleCompletePasswordRecovery}
              onDone={() => {
                setIsPasswordRecovery(false);
                showAppDialog('Reset password', 'Password updated');
              }}
            />
          ) : (
            !isOnline ? (
              <OfflineGate />
            ) : (
              <NavigationContainer>
                {isAuthenticated ? (
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
                  </Stack.Navigator>
                )}
              </NavigationContainer>
            )
          )}
        </AppProvider>
        <AppDialogHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
