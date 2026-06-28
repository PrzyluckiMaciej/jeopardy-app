export type MediaType = 'image' | 'audio' | 'video'

export function mimeTypeToMediaType(mimeType: string): MediaType {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('audio/')) return 'audio'
  return 'video'
}
