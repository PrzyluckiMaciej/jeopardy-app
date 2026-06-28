import { describe, expect, it } from 'vitest'
import { mimeTypeToMediaType } from '../mediaType'

describe('mimeTypeToMediaType', () => {
  it('maps image mime types', () => {
    expect(mimeTypeToMediaType('image/png')).toBe('image')
    expect(mimeTypeToMediaType('image/jpeg')).toBe('image')
  })

  it('maps audio mime types', () => {
    expect(mimeTypeToMediaType('audio/mpeg')).toBe('audio')
    expect(mimeTypeToMediaType('audio/wav')).toBe('audio')
  })

  it('maps everything else to video', () => {
    expect(mimeTypeToMediaType('video/mp4')).toBe('video')
    expect(mimeTypeToMediaType('application/octet-stream')).toBe('video')
  })
})
