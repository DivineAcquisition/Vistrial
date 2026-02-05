-- ============================================
-- STORAGE BUCKETS FOR AUDIO FILES
-- ============================================

-- Create audio bucket for voice drops
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'audio',
  'audio',
  true,
  5242880, -- 5MB limit
  ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav']
)
ON CONFLICT (id) DO NOTHING;

-- Policy: Anyone can read audio files (they're public URLs)
CREATE POLICY "Public audio access"
ON storage.objects FOR SELECT
USING (bucket_id = 'audio');

-- Policy: Authenticated users can upload to their org's folder
CREATE POLICY "Org members can upload audio"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'audio' AND
  auth.role() = 'authenticated'
);

-- Policy: Org members can delete their org's audio
CREATE POLICY "Org members can delete audio"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'audio' AND
  auth.role() = 'authenticated'
);
