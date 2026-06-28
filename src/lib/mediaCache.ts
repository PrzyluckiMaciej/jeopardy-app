import { mimeTypeToMediaType, type MediaType } from './mediaType'

const cache = new Map<string, Blob>()
const objectUrls = new Map<string, string>()

export function getCachedMedia(mediaId: string): Blob | undefined {
  return cache.get(mediaId)
}

export function setCachedMedia(mediaId: string, blob: Blob): void {
  cache.set(mediaId, blob)
}

export function hasCachedMedia(mediaId: string): boolean {
  return cache.has(mediaId)
}

export function getOrCreateObjectUrl(mediaId: string): string | undefined {
  const existing = objectUrls.get(mediaId)
  if (existing) return existing
  const blob = cache.get(mediaId)
  if (!blob) return undefined
  const url = URL.createObjectURL(blob)
  objectUrls.set(mediaId, url)
  return url
}

export function resolveActiveMedia(
  mediaId: string | undefined,
  mediaType?: MediaType,
): { type: MediaType; dataUrl: string } | null {
  if (!mediaId) return null
  const blob = cache.get(mediaId)
  const resolvedType = mediaType ?? (blob ? mimeTypeToMediaType(blob.type) : undefined)
  if (!resolvedType) return null
  const dataUrl = getOrCreateObjectUrl(mediaId)
  if (!dataUrl) return null
  return { type: resolvedType, dataUrl }
}

export function clearCache(): void {
  for (const url of objectUrls.values()) {
    URL.revokeObjectURL(url)
  }
  objectUrls.clear()
  cache.clear()
}
