import NetInfo from '@react-native-community/netinfo';
import { showAppDialog } from '../components/AppDialog';

export const NO_CONNECTION_MESSAGE = "There's no connection";

function isConnectedStateUsable(state) {
  if (state?.isConnected === true) {
    return true;
  }

  if (state?.isConnected === false) {
    return false;
  }

  return state?.isInternetReachable === true;
}

async function hasUsableConnection() {
  const state = await NetInfo.fetch();
  return isConnectedStateUsable(state);
}

export async function ensureOnlinePopup() {
  try {
    if (await hasUsableConnection()) {
      return true;
    }
  } catch {
    return true;
  }

  showAppDialog('No connection', NO_CONNECTION_MESSAGE);
  return false;
}

export async function ensureOnlineResult(extra = {}) {
  if (await ensureOnlinePopup()) {
    return null;
  }

  return {
    ok: false,
    message: NO_CONNECTION_MESSAGE,
    ...extra,
  };
}

export async function ensureOnlineOrThrow() {
  if (await ensureOnlinePopup()) {
    return;
  }

  throw new Error(NO_CONNECTION_MESSAGE);
}

export function normalizeNetworkState(state) {
  return isConnectedStateUsable(state);
}

export function subscribeToNetworkState(listener) {
  return NetInfo.addEventListener((state) => {
    listener(normalizeNetworkState(state));
  });
}
