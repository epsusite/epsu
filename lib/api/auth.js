import { requireSupabase } from '../supabase';

async function getFunctionErrorMessage(error, data) {
  if (data?.error) {
    return data.error;
  }

  const response = error?.context;
  if (response && typeof response.clone === 'function') {
    try {
      const clonedResponse = response.clone();
      const jsonBody = await clonedResponse.json();
      if (jsonBody?.error) {
        return jsonBody.error;
      }
    } catch {
      // Fall through to text parsing.
    }

    try {
      const clonedResponse = response.clone();
      const textBody = (await clonedResponse.text())?.trim();
      if (textBody) {
        return textBody;
      }
    } catch {
      // Fall through to the generic error message below.
    }
  }

  return error?.message || 'Could not reach password policy service';
}

async function invokePasswordUniquenessFunction(payload) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.functions.invoke('enforce-password-uniqueness', {
    body: payload,
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error, data));
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}

async function invokeAuthHandoffFunction(payload) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.functions.invoke('auth-handoff', {
    body: payload,
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error, data));
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}

export async function signUpWithUniquePassword({ email, password, userData }) {
  return invokePasswordUniquenessFunction({
    action: 'sign_up',
    email,
    password,
    userData,
  });
}

export async function updatePasswordWithUniqueness({ password, passwordLength }) {
  return invokePasswordUniquenessFunction({
    action: 'update_password',
    password,
    passwordLength,
  });
}

export async function redeemAuthHandoff(token) {
  return invokeAuthHandoffFunction({
    action: 'redeem_handoff',
    token,
  });
}
