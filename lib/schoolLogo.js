import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { requireSupabase } from './supabase';

export const SCHOOL_LOGO_BUCKET = 'school-logos';
const MAX_LOGO_DIMENSION = 512;
const LOGO_COMPRESSION = 0.8;
const LOGO_FILE_EXTENSION = 'jpg';
const LOGO_CONTENT_TYPE = 'image/jpeg';

function logSchoolLogo(message, details = null) {
  if (details == null) {
    console.log(`[school-logo] ${message}`);
    return;
  }

  try {
    console.log(`[school-logo] ${message}`, details);
  } catch {
    console.log(`[school-logo] ${message}`);
  }
}

export async function uploadSchoolLogo({ slug, localUri }) {
  const supabase = requireSupabase();
  logSchoolLogo('upload start', {
    slug,
    hasLocalUri: Boolean(localUri),
  });

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
      // JPEG is materially safer than WEBP across native image pipelines and
      // avoids approval-flow stalls during admin logo processing.
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );
  logSchoolLogo('image processed', {
    slug,
    processedUri: manipulatedImage?.uri ?? null,
  });

  const fileBase64 = await FileSystem.readAsStringAsync(manipulatedImage.uri, {
    encoding: 'base64',
  });
  const fileBytes = decode(fileBase64);

  const path = `epsus/${user.id}/${slug}-${Date.now()}.${LOGO_FILE_EXTENSION}`;
  const { error } = await supabase.storage
    .from(SCHOOL_LOGO_BUCKET)
    .upload(path, fileBytes, {
      contentType: LOGO_CONTENT_TYPE,
      cacheControl: '31536000',
      upsert: false,
    });

  if (error) {
    logSchoolLogo('upload failed', {
      slug,
      path,
      message: error?.message ?? 'Unknown upload error',
    });
    throw error;
  }

  logSchoolLogo('upload success', {
    slug,
    path,
  });

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
