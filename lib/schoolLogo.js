import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { requireSupabase } from './supabase';

export const SCHOOL_LOGO_BUCKET = 'school-logos';
const MAX_LOGO_DIMENSION = 512;
const LOGO_COMPRESSION = 0.8;

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

  const manipulatedImage = await ImageManipulator.manipulateAsync(
    localUri,
    [{ resize: { width: MAX_LOGO_DIMENSION } }],
    {
      compress: LOGO_COMPRESSION,
      format: ImageManipulator.SaveFormat.WEBP,
    }
  );

  const fileBase64 = await FileSystem.readAsStringAsync(manipulatedImage.uri, {
    encoding: 'base64',
  });
  const fileBytes = decode(fileBase64);

  const path = `epsus/${user.id}/${slug}-${Date.now()}.webp`;
  const { error } = await supabase.storage
    .from(SCHOOL_LOGO_BUCKET)
    .upload(path, fileBytes, {
      contentType: 'image/webp',
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
