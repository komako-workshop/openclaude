/**
 * Example 7: Custom Tools
 *
 * Shows how to define and use custom tools alongside built-in tools.
 *
 * Run: npx tsx examples/07-custom-tools.ts
 */
import { createAgent, getAllBaseTools } from '@shipany/open-agent-sdk'

/**
 * Helper to create custom tools compatible with the engine.
 * Provides all required interface methods so the tool integrates
 * seamlessly with the QueryEngine tool execution pipeline.
 */
function customTool(config: {
  name: string
  description: string
  properties: Record<string, unknown>
  required?: string[]
  handler: (input: any) => Promise<string>
}) {
  const passthroughSchema = {
    safeParse: (v: any) => ({ success: true, data: v }),
    parse: (v: any) => v,
  }

  return {
    name: config.name,
    description: config.description,
    get inputSchema() { return passthroughSchema },
    inputJSONSchema: {
      type: 'object' as const,
      properties: config.properties,
      required: config.required || [],
    },
    async prompt() { return config.description },
    userFacingName: () => config.name,
    async call(input: any) {
      const output = await config.handler(input)
      return { data: output }
    },
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
    isEnabled: () => true,
    renderToolUseMessage: () => null,
    renderToolResultMessage: () => null,
    mapToolResultToToolResultBlockParam: (data: any, id: string) => ({
      type: 'tool_result',
      tool_use_id: id,
      content: typeof data === 'string' ? data : JSON.stringify(data),
    }),
  } as any
}

const weatherTool = customTool({
  name: 'GetWeather',
  description: 'Get current weather for a city. Returns temperature and conditions.',
  properties: {
    city: { type: 'string', description: 'City name (e.g., "Tokyo", "London")' },
  },
  required: ['city'],
  async handler(input) {
    const temps: Record<string, number> = {
      tokyo: 22, london: 14, beijing: 25, 'new york': 18, paris: 16,
    }
    const temp = temps[input.city?.toLowerCase()] ?? 20
    return `Weather in ${input.city}: ${temp}°C, partly cloudy`
  },
})

const calculatorTool = customTool({
  name: 'Calculator',
  description: 'Evaluate a mathematical expression. Use ** for exponentiation.',
  properties: {
    expression: { type: 'string', description: 'Math expression (e.g., "42 * 17 + 3", "2 ** 10")' },
  },
  required: ['expression'],
  async handler(input) {
    try {
      const result = Function(`'use strict'; return (${input.expression})`)()
      return `${input.expression} = ${result}`
    } catch (e: any) {
      return `Error: ${e.message}`
    }
  },
})

async function main() {
  console.log('--- Example 7: Custom Tools ---\n')

  const builtinTools = getAllBaseTools()
  const allTools = [...builtinTools, weatherTool, calculatorTool]

  const agent = createAgent({
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
    maxTurns: 10,
    tools: allTools,
  })

  console.log(`Loaded ${allTools.length} tools (${builtinTools.length} built-in + 2 custom)\n`)

  for await (const event of agent.query(
    'What is the weather in Tokyo and London? Also calculate 2**10 * 3. Be brief.',
  )) {
    const msg = event as any
    if (msg.type === 'assistant') {
      for (const block of msg.message?.content || []) {
        if (block.type === 'tool_use') {
          console.log(`[${block.name}] ${JSON.stringify(block.input)}`)
        }
        if (block.type === 'text' && block.text.trim()) {
          console.log(`\n${block.text}`)
        }
      }
    }
    if (msg.type === 'result') {
      console.log(`\n--- ${msg.subtype} ---`)
    }
  }
}

main().catch(console.error)
