import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.100.1';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const BATCH_SIZE = 50;
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

type AppNotification = {
  id: string;
  profile_id: string;
  kind: string;
  title: string;
  body: string;
  related_epsu_id: string | null;
};

type PushToken = {
  id: string;
  profile_id: string;
  expo_push_token: string;
  platform: string;
};

type FcmServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

function getFcmServiceAccountFromEnv() {
  const projectId = Deno.env.get('FCM_PROJECT_ID')?.trim();
  const clientEmail = Deno.env.get('FCM_CLIENT_EMAIL')?.trim();
  const privateKeyB64 = Deno.env.get('FCM_PRIVATE_KEY_B64')?.trim();

  if (projectId && clientEmail && privateKeyB64) {
    try {
      const privateKey = atob(privateKeyB64);
      return {
        project_id: projectId,
        client_email: clientEmail,
        private_key: privateKey,
      } satisfies FcmServiceAccount;
    } catch {
      throw new Error('FCM private key secret is not valid base64');
    }
  }

  const serviceAccountRaw = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON');
  if (!serviceAccountRaw) {
    return null;
  }

  try {
    return JSON.parse(serviceAccountRaw) as FcmServiceAccount;
  } catch {
    throw new Error('FCM service account secret is not valid JSON');
  }
}

type NotificationOutcome = {
  sent: boolean;
  errors: string[];
  ticketIds: string[];
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function base64UrlEncode(input: string | Uint8Array) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function pemToArrayBuffer(pem: string) {
  const base64 = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

async function getFcmAccessToken(serviceAccount: FcmServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: FCM_SCOPE,
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    })
  );
  const unsignedJwt = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(serviceAccount.private_key),
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsignedJwt)
  );
  const signedJwt = `${unsignedJwt}.${base64UrlEncode(new Uint8Array(signature))}`;

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signedJwt,
    }),
  });

  const tokenPayload = await tokenResponse.json().catch(() => null);
  if (!tokenResponse.ok || !tokenPayload?.access_token) {
    throw new Error(tokenPayload?.error_description ?? 'Could not obtain FCM access token');
  }

  return tokenPayload.access_token as string;
}

function getNotificationOutcomeMap(notifications: AppNotification[]) {
  return new Map(
    notifications.map((notification) => [
      notification.id,
      {
        sent: false,
        errors: [],
        ticketIds: [],
      } satisfies NotificationOutcome,
    ])
  );
}

function isExpoPushToken(token: string) {
  return token.startsWith('ExponentPushToken[');
}

async function isAuthorizedDeliveryRequest(request: Request, supabase: ReturnType<typeof createClient>) {
  const configuredSecret = Deno.env.get('PUSH_DELIVERY_SECRET');
  const requestSecret = request.headers.get('x-epsu-push-secret');

  if (configuredSecret && requestSecret && requestSecret === configuredSecret) {
    return true;
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return false;
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    return false;
  }

  const { data: isAdmin, error: adminError } = await supabase.rpc('is_platform_admin', {
    target_profile_id: user.id,
  });

  return !adminError && Boolean(isAdmin);
}

async function checkPreviousReceipts(supabase: ReturnType<typeof createClient>) {
  const receiptReadyCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: notifications } = await supabase
    .from('app_notifications')
    .select('id, push_ticket_ids')
    .not('push_ticket_ids', 'is', null)
    .is('push_receipts_checked_at', null)
    .lte('push_sent_at', receiptReadyCutoff)
    .limit(BATCH_SIZE);

  const receiptIds = (notifications ?? [])
    .flatMap((notification: { push_ticket_ids?: string[] | null }) => notification.push_ticket_ids ?? [])
    .filter(Boolean);

  if (!receiptIds.length) {
    return { checked: 0, failedReceipts: 0 };
  }

  const expoResponse = await fetch(EXPO_RECEIPTS_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ids: receiptIds }),
  });

  const expoResult = await expoResponse.json().catch(() => null);
  const receipts = expoResult?.data ?? {};
  const failedReceipts = Object.values(receipts).filter(
    (receipt) => (receipt as { status?: string })?.status === 'error'
  ).length;

  await supabase
    .from('app_notifications')
    .update({
      push_receipts_checked_at: new Date().toISOString(),
      push_error: failedReceipts ? 'One or more Expo push receipts failed' : null,
    })
    .in('id', (notifications ?? []).map((notification: { id: string }) => notification.id));

  return {
    checked: receiptIds.length,
    failedReceipts,
  };
}

async function finalizeNotificationOutcomes(
  supabase: ReturnType<typeof createClient>,
  outcomes: Map<string, NotificationOutcome>
) {
  for (const [notificationId, outcome] of outcomes.entries()) {
    await supabase
      .from('app_notifications')
      .update({
        push_sent_at: outcome.sent ? new Date().toISOString() : null,
        push_error: outcome.errors.length ? outcome.errors.join(' | ') : null,
        push_ticket_ids: outcome.ticketIds.length ? outcome.ticketIds : null,
      })
      .eq('id', notificationId);
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Supabase function secrets are missing' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });

  if (!(await isAuthorizedDeliveryRequest(request, supabase))) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const receiptSummary = await checkPreviousReceipts(supabase);

  const { data: notifications, error: notificationError } = await supabase
    .from('app_notifications')
    .select(`
      id,
      profile_id,
      kind,
      title,
      body,
      related_epsu_id,
      profiles!inner(notifications_enabled)
    `)
    .is('push_sent_at', null)
    .is('read_at', null)
    .eq('profiles.notifications_enabled', true)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (notificationError) {
    return jsonResponse({ error: notificationError.message }, 500);
  }

  const pendingNotifications = (notifications ?? []) as unknown as AppNotification[];
  if (!pendingNotifications.length) {
    return jsonResponse({ ok: true, sent: 0, notifications: 0, receipts: receiptSummary });
  }

  const profileIds = [...new Set(pendingNotifications.map((notification) => notification.profile_id))];
  const { data: tokens, error: tokenError } = await supabase
    .from('profile_push_tokens')
    .select('id, profile_id, expo_push_token, platform')
    .in('profile_id', profileIds)
    .eq('enabled', true);

  if (tokenError) {
    return jsonResponse({ error: tokenError.message }, 500);
  }

  const tokensByProfileId = new Map<string, PushToken[]>();
  for (const token of (tokens ?? []) as PushToken[]) {
    const existing = tokensByProfileId.get(token.profile_id) ?? [];
    existing.push(token);
    tokensByProfileId.set(token.profile_id, existing);
  }

  const outcomeMap = getNotificationOutcomeMap(pendingNotifications);
  let deliveredCount = 0;

  const expoMessages = pendingNotifications.flatMap((notification) =>
    (tokensByProfileId.get(notification.profile_id) ?? [])
      .filter((token) => isExpoPushToken(token.expo_push_token))
      .map((token) => ({
        to: token.expo_push_token,
        title: notification.title,
        body: notification.body,
        sound: 'epsu_notification.wav',
        channelId: 'default',
        notificationId: notification.id,
        data: {
          notificationId: notification.id,
          kind: notification.kind,
          relatedEpsuId: notification.related_epsu_id ?? '',
        },
      }))
  );

  const fcmTargets = pendingNotifications.flatMap((notification) =>
    (tokensByProfileId.get(notification.profile_id) ?? [])
      .filter((token) => token.platform === 'android' && !isExpoPushToken(token.expo_push_token))
      .map((token) => ({
        tokenId: token.id,
        token: token.expo_push_token,
        notification,
      }))
  );

  if (!expoMessages.length && !fcmTargets.length) {
    await supabase
      .from('app_notifications')
      .update({ push_error: 'No enabled push tokens' })
      .in('id', pendingNotifications.map((notification) => notification.id));

    return jsonResponse({
      ok: true,
      sent: 0,
      notifications: pendingNotifications.length,
      receipts: receiptSummary,
    });
  }

  if (expoMessages.length) {
    const expoResponse = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        expoMessages.map((message) => ({
          to: message.to,
          title: message.title,
          body: message.body,
          sound: message.sound,
          channelId: message.channelId,
          data: message.data,
        }))
      ),
    });

    const expoResult = await expoResponse.json().catch(() => null);
    if (!expoResponse.ok) {
      const message = expoResult?.errors?.[0]?.message ?? 'Expo push request failed';
      pendingNotifications.forEach((notification) => {
        outcomeMap.get(notification.id)?.errors.push(message);
      });
    } else {
      const disabledTokens = new Set<string>();
      expoResult?.data?.forEach(
        (ticket: { id?: string; status?: string; details?: { error?: string } }, index: number) => {
          const message = expoMessages[index];
          const outcome = outcomeMap.get(message.notificationId);
          if (!outcome) {
            return;
          }

          if (ticket?.status === 'ok') {
            outcome.sent = true;
            deliveredCount += 1;
            if (ticket.id) {
              outcome.ticketIds.push(ticket.id);
            }
            return;
          }

          const errorMessage = ticket?.details?.error ?? ticket?.status ?? 'Expo push failed';
          outcome.errors.push(errorMessage);
          if (ticket?.details?.error === 'DeviceNotRegistered') {
            disabledTokens.add(message.to);
          }
        }
      );

      if (disabledTokens.size) {
        await supabase
          .from('profile_push_tokens')
          .update({ enabled: false })
          .in('expo_push_token', [...disabledTokens]);
      }
    }
  }

  if (fcmTargets.length) {
    let serviceAccount: FcmServiceAccount | null = null;

    try {
      serviceAccount = getFcmServiceAccountFromEnv();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'FCM setup failed';
      fcmTargets.forEach(({ notification }) => {
        outcomeMap.get(notification.id)?.errors.push(message);
      });
    }

    if (!serviceAccount) {
      fcmTargets.forEach(({ notification }) => {
        outcomeMap.get(notification.id)?.errors.push('FCM service account secret missing');
      });
    } else {
      try {
        const accessToken = await getFcmAccessToken(serviceAccount);

        for (const target of fcmTargets) {
          const response = await fetch(
            `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify({
                message: {
                  token: target.token,
                  notification: {
                    title: target.notification.title,
                    body: target.notification.body,
                  },
                  android: {
                    priority: 'HIGH',
                    notification: {
                      channel_id: 'default',
                      sound: 'epsu_notification.wav',
                    },
                  },
                  data: {
                    notificationId: target.notification.id,
                    kind: target.notification.kind,
                    relatedEpsuId: target.notification.related_epsu_id ?? '',
                  },
                },
              }),
            }
          );

          const result = await response.json().catch(() => null);
          const outcome = outcomeMap.get(target.notification.id);
          if (!outcome) {
            continue;
          }

          if (response.ok) {
            outcome.sent = true;
            deliveredCount += 1;
            continue;
          }

          const fcmError =
            result?.error?.details?.[0]?.errorCode ??
            result?.error?.status ??
            result?.error?.message ??
            'FCM push failed';
          outcome.errors.push(fcmError);

          if (fcmError === 'UNREGISTERED' || fcmError === 'INVALID_ARGUMENT') {
            await supabase
              .from('profile_push_tokens')
              .update({ enabled: false })
              .eq('id', target.tokenId);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'FCM setup failed';
        fcmTargets.forEach(({ notification }) => {
          outcomeMap.get(notification.id)?.errors.push(message);
        });
      }
    }
  }

  await finalizeNotificationOutcomes(supabase, outcomeMap);

  return jsonResponse({
    ok: true,
    sent: deliveredCount,
    notifications: pendingNotifications.length,
    receipts: receiptSummary,
  });
});
