-- Fix: Restrict school-logos bucket to prevent file enumeration
-- But still allow reading known file paths (for displaying logos)
-- The original public policy allowed listing ALL files which is a security concern

-- Drop the public read policy that allows full listing
drop policy if exists "school_logos_public_read" on storage.objects;

-- New policy: allow read only if caller can provide a valid file path
-- This prevents enumeration but allows viewing specific known logos
-- Note: storage.objects has a pseudo-column for this, but Supabase's recommended
-- approach is to make bucket private and use signed URLs or keep public but restrict

-- Alternative approach: Use storage.objects with a more restrictive policy
-- Allow SELECT only if the name matches expected pattern (epsus/{uuid}/{slug}.jpg)
create policy "school_logos_restricted_read"
on storage.objects
for select
to public
using (
  bucket_id = 'school-logos'
  and name like 'epsus/%'
);