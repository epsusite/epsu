(function () {
  const AUTH_HANDOFF_FUNCTION_URL = 'https://xzgzzuxmtjrppavvynuy.supabase.co/functions/v1/auth-handoff';
  const action = document.body.dataset.authAction;
  const actionPath = action === 'reset-password' ? 'reset-password' : 'auth/confirm';
  const query = window.location.search || '';
  const hash = window.location.hash || '';
  const queryParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const params = new URLSearchParams();

  queryParams.forEach((value, key) => {
    params.set(key, value);
  });

  hashParams.forEach((value, key) => {
    params.set(key, value);
  });

  const errorDescription = params.get('error_description');
  const code = params.get('code');
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const hasAuthPayload = Boolean(code || (accessToken && refreshToken));
  const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
  const appUrl = 'epsu://' + actionPath + query + hash;

  const title = document.getElementById('status-title');
  const body = document.getElementById('status-body');
  const note = document.getElementById('status-note');
  const openButton = document.getElementById('open-app-link');
  const desktopHandoffCard = document.getElementById('desktop-handoff-card');
  const desktopHandoffBody = document.getElementById('desktop-handoff-body');
  const desktopHandoffQr = document.getElementById('desktop-handoff-qr');

  openButton.href = appUrl;

  async function createDesktopHandoff(tokenHashValue, otpTypeValue) {
    if (!desktopHandoffCard || !desktopHandoffQr || !window.QRCode) {
      return;
    }

    desktopHandoffCard.hidden = false;
    desktopHandoffBody.textContent = 'Preparing a phone login QR...';
    desktopHandoffQr.innerHTML = '';

    const response = await fetch(AUTH_HANDOFF_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'create_handoff',
        token_hash: tokenHashValue,
        type: otpTypeValue,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.error) {
      throw new Error(payload?.error || 'Could not prepare the phone login QR');
    }

    desktopHandoffBody.textContent = 'Scan this QR with the phone that has Epsu installed.';
    const qrCanvas = document.createElement('canvas');
    desktopHandoffQr.innerHTML = '';
    desktopHandoffQr.appendChild(qrCanvas);
    await window.QRCode.toCanvas(qrCanvas, payload.handoffUrl, {
      width: 220,
      margin: 1,
      color: {
        dark: '#20131a',
        light: '#ffffff',
      },
    });
  }

  if (errorDescription) {
    title.textContent = action === 'reset-password' ? 'Reset link error' : 'Confirmation error';
    body.textContent = decodeURIComponent(errorDescription.replace(/\+/g, ' '));
    note.textContent = 'Request a fresh email from the app and try again.';
    openButton.textContent = 'Back to Epsu';
    return;
  }

  if (!hasAuthPayload) {
    title.textContent = 'Link opened';
    body.textContent =
      action === 'reset-password'
        ? 'This page only works from the password reset email.'
        : 'This page only works from the email confirmation link.';
    note.textContent = 'Return to the latest email from Epsu and open the link there.';
    openButton.textContent = 'Open Epsu';
    return;
  }

  if (action === 'reset-password') {
    title.textContent = 'Open Epsu to reset your password';
    body.textContent =
      'If you are on your phone, Epsu should open automatically. If you are on a computer, return to your phone and open the app there.';
    note.textContent = 'The reset is completed inside the app, not on this web page.';
    openButton.textContent = 'Open Epsu';
  } else {
    title.textContent = 'Email confirmed';
    body.textContent =
      'If you are on your phone, Epsu should open automatically. If you confirmed on a computer, your account is now verified and you can log in on your phone.';
    note.textContent = 'Use the button below if this device has Epsu installed. On desktop, scan the QR to continue on your phone.';
    openButton.textContent = 'Open Epsu';
  }

  if (isMobile) {
    window.setTimeout(() => {
      window.location.replace(appUrl);
    }, 250);
    return;
  }

  if (action === 'confirm' && tokenHash && otpType) {
    createDesktopHandoff(tokenHash, otpType).catch((error) => {
      if (!desktopHandoffCard || !desktopHandoffBody) {
        return;
      }

      desktopHandoffCard.hidden = false;
      desktopHandoffBody.textContent = error?.message || 'Could not prepare the phone login QR.';
      if (desktopHandoffQr) {
        desktopHandoffQr.innerHTML = '';
      }
    });
  }
})();
