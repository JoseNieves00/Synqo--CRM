-- ==============================================================================
-- Migración: Soporte integral de formatos de audio y video en bucket chat-media
-- Permite reproducción y descarga directa de notas de voz desde el CRM
-- ==============================================================================

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'application/octet-stream',
  'audio/ogg',
  'audio/opus',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/wav',
  'audio/webm',
  'audio/aac',
  'audio/x-m4a',
  'audio/m4a',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/3gpp'
],
file_size_limit = 26214400 -- 25MB
WHERE id = 'chat-media';
