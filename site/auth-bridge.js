(function () {
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

  openButton.href = appUrl;

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
    note.textContent = 'Use the button below if this device has Epsu installed.';
    openButton.textContent = 'Open Epsu';
  }

  if (isMobile) {
    window.setTimeout(() => {
      window.location.replace(appUrl);
    }, 250);
  }
})();
