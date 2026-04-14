import { describe, expect, it } from 'vitest'
import {
  createProgressTracker,
  updateProgressFromMessage,
} from './LocalAgentTask.js'

describe('updateProgressFromMessage', () => {
  it('ignores assistant error messages without usage', () => {
    const tracker = createProgressTracker()

    expect(() =>
      updateProgressFromMessage(tracker, {
        type: 'assistant',
        uuid: '11111111-1111-1111-1111-111111111111',
        timestamp: new Date().toISOString(),
        isApiErrorMessage: true,
        message: {
          type: 'error',
          error: {
            type: 'api_error',
            message: 'internal stream ended unexpectedly',
          },
          request_id: null,
          content: [],
        },
      } as any),
    ).not.toThrow()

    expect(tracker.latestInputTokens).toBe(0)
    expect(tracker.cumulativeOutputTokens).toBe(0)
    expect(tracker.toolUseCount).toBe(0)
  })

  it('still records tool activity when usage is missing', () => {
    const tracker = createProgressTracker()

    updateProgressFromMessage(tracker, {
      type: 'assistant',
      uuid: '22222222-2222-2222-2222-222222222222',
      timestamp: new Date().toISOString(),
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'tool-1',
            name: 'Read',
            input: { file_path: '/tmp/demo.txt' },
          },
        ],
      },
    } as any)

    expect(tracker.latestInputTokens).toBe(0)
    expect(tracker.cumulativeOutputTokens).toBe(0)
    expect(tracker.toolUseCount).toBe(1)
    expect(tracker.recentActivities).toHaveLength(1)
    expect(tracker.recentActivities[0]?.toolName).toBe('Read')
  })
})
