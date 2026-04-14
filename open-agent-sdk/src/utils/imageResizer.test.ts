import { describe, expect, it, vi, beforeEach } from 'vitest'
import { API_IMAGE_MAX_BASE64_SIZE } from '../constants/apiLimits.js'

const { getImageProcessorMock } = vi.hoisted(() => ({
  getImageProcessorMock: vi.fn(),
}))

vi.mock('../tools/FileReadTool/imageProcessor.js', () => ({
  getImageProcessor: getImageProcessorMock,
}))

vi.mock('../services/analytics/index.js', () => ({
  logEvent: vi.fn(),
}))

vi.mock('./debug.js', () => ({
  logForDebugging: vi.fn(),
}))

vi.mock('./log.js', () => ({
  logError: vi.fn(),
}))

import {
  ImageResizeError,
  maybeResizeAndDownsampleImageBuffer,
} from './imageResizer.js'

function createOversizedPngBuffer(byteLength: number): Buffer {
  const buffer = Buffer.alloc(Math.max(byteLength, 24), 0)

  // PNG signature
  buffer[0] = 0x89
  buffer[1] = 0x50
  buffer[2] = 0x4e
  buffer[3] = 0x47
  buffer[4] = 0x0d
  buffer[5] = 0x0a
  buffer[6] = 0x1a
  buffer[7] = 0x0a

  // IHDR width / height
  buffer.writeUInt32BE(3000, 16)
  buffer.writeUInt32BE(2200, 20)

  return buffer
}

describe('maybeResizeAndDownsampleImageBuffer', () => {
  beforeEach(() => {
    getImageProcessorMock.mockReset()
    getImageProcessorMock.mockRejectedValue(new Error('mock resize failure'))
  })

  it('falls back to the original image when resize fails but base64 size is still within API limits', async () => {
    const buffer = createOversizedPngBuffer(1024)

    const result = await maybeResizeAndDownsampleImageBuffer(
      buffer,
      buffer.length,
      'png',
    )

    expect(result.mediaType).toBe('png')
    expect(result.buffer.equals(buffer)).toBe(true)
    expect(result.buffer.length * 4 / 3).toBeLessThanOrEqual(
      API_IMAGE_MAX_BASE64_SIZE,
    )
  })

  it('still throws when resize fails and the original image is too large for the API', async () => {
    const buffer = createOversizedPngBuffer(4 * 1024 * 1024)

    await expect(
      maybeResizeAndDownsampleImageBuffer(buffer, buffer.length, 'png'),
    ).rejects.toThrow(ImageResizeError)
    await expect(
      maybeResizeAndDownsampleImageBuffer(buffer, buffer.length, 'png'),
    ).rejects.toThrow('The image exceeds the 5MB API limit and compression failed')
  })
})
