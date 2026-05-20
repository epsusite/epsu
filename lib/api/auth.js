import { requireSupabase } from '../supabase';

async function invokePasswordUniquenessFunction(payload) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.functions.invoke('enforce-password-uniqueness', {
    body: payload,
  });

  if (error) {
    throw new Error(error.message || 'Could not reach password policy service');
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
