import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import { requireSupabase } from './supabase';

export const SCHOOL_LOGO_BUCKET = 'school-logos';

export async function uploadSchoolLogo({ slug, localUri }) {
  const supabase = requireSupabase();
  if (!localUri) {
    throw new Error('School logo source required');
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    throw new Error('You must be logged in to upload a school logo');
  }

  const fileBase64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: 'base64',
  });
  const fileBytes = decode(fileBase64);

  const path = `epsus/${user.id}/${slug}-${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from(SCHOOL_LOGO_BUCKET)
    .upload(path, fileBytes, {
      contentType: 'image/jpeg',
      cacheControl: '31536000',
      upsert: false,
    });

  if (error) {
    throw error;
  }

  return path;
}

export function getSchoolLogoUrl(logoPath) {
  if (!logoPath) {
    return null;
  }

  const supabase = requireSupabase();
  const { data } = supabase.storage.from(SCHOOL_LOGO_BUCKET).getPublicUrl(logoPath);
  return data?.publicUrl ?? null;
}

export async function deleteSchoolLogo(logoPath) {
  if (!logoPath) {
    return;
  }

  const supabase = requireSupabase();
  const { error } = await supabase.storage.from(SCHOOL_LOGO_BUCKET).remove([logoPath]);
  if (error) {
    throw error;
  }
}
