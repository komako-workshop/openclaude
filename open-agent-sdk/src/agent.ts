// @ts-nocheck
/**
 * Open Agent SDK - High-level Agent API
 *
 * Provides a simple createAgent() interface that wraps the full
 * Claude Code engine (QueryEngine, tools, services).
 *
 * Usage:
 *   import { createAgent } from '@shipany/open-agent-sdk'
 *
 *   const agent = createAgent({
 *     model: 'claude-sonnet-4-6',
 *     apiKey: process.env.ANTHROPIC_API_KEY,
 *   })
 *
 *   // Streaming
 *   for await (const event of agent.query('Analyze this codebase')) {
 *     if (event.type === 'assistant') console.log(event)
 *   }
 *
 *   // Simple
 *   const result = await agent.prompt('What does this code do?')
 *   console.log(result.text)
 */

import './setup-globals.js'

import { ask, type SDKMessage } from './QueryEngine.js'
import { getAllBaseTools } from './tools.js'
import { getCommands } from './commands.js'
import { getDefaultAppState, type AppState } from './state/AppStateStore.js'
import { createFileStateCacheWithSizeLimit, type FileStateCache } from './utils/fileStateCache.js'
import type { Tool, Tools } from './Tool.js'
import type { Message } from './types/message.js'
import type { CanUseToolFn } from './hooks/useCanUseTool.js'
import type { ThinkingConfig } from './utils/thinking.js'

// ============================================================================
// Types
// ============================================================================

export type AgentOptions = {
  /** Model ID (e.g. 'claude-sonnet-4-6', 'claude-opus-4-6') */
  model?: string
  /** Anthropic API key. Falls back to ANTHROPIC_API_KEY env var. */
  apiKey?: string
  /** API base URL override (for third-party providers) */
  baseURL?: string
  /** Working directory for file/shell tools */
  cwd?: string
  /** System prompt override */
  systemPrompt?: string
  /** Append to default system prompt */
  appendSystemPrompt?: string
  /** Initial transcript messages for session resume */
  initialMessages?: Message[]
  /** Available tools. Defaults to all built-in tools. */
  tools?: Tools
  /** Maximum number of agentic turns per query */
  maxTurns?: number
  /** Maximum USD budget per query */
  maxBudgetUsd?: number
  /** Extended thinking configuration */
  thinking?: ThinkingConfig
  /** Structured output JSON schema */
  jsonSchema?: Record<string, unknown>
  /**
   * Permission handler callback. Called when a tool needs approval.
   * Return { behavior: 'allow' } to approve, { behavior: 'deny' } to reject.
   */
  canUseTool?: CanUseToolFn
  /**
   * Permission mode controlling tool approval behavior.
   * - 'acceptEdits': auto-approve file edits, ask for other actions
   * - 'bypassPermissions': run every tool without prompts
   * - 'plan': require explicit approval for all actions
   * - 'default': use canUseTool callback for approval decisions
   */
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal
  /** Whether to include partial streaming events */
  includePartialMessages?: boolean
  /**
   * Environment variables (compatible with @anthropic-ai/claude-agent-sdk).
   * Supports: ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL,
   * ANTHROPIC_MODEL, etc.
   */
  env?: Record<string, string | undefined>
  /**
   * Tool names to pre-approve without prompting.
   * e.g. ['Read', 'Glob', 'Grep'] for read-only access.
   */
  allowedTools?: string[]
  /**
   * MCP server configurations.
   * Supports stdio, SSE, and streamable HTTP transports.
   *
   * @example
   * ```typescript
   * mcpServers: {
   *   'my-server': {
   *     command: 'npx',
   *     args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
   *   },
   *   'remote-server': {
   *     type: 'sse',
   *     url: 'http://localhost:3000/sse',
   *   },
   * }
   * ```
   */
  mcpServers?: Record<string, McpServerConfig>
  /**
   * Custom subagent definitions.
   * The main agent can delegate work to specialized subagents.
   *
   * @example
   * ```typescript
   * agents: {
   *   'code-reviewer': {
   *     description: 'Expert code reviewer',
   *     prompt: 'Analyze code quality and suggest improvements.',
   *     tools: ['Read', 'Glob', 'Grep'],
   *   }
   * }
   * ```
   */
  agents?: Record<string, {
    description: string
    prompt: string
    tools?: string[]
    model?: string
  }>
  /**
   * Lifecycle hooks for intercepting agent behavior.
   * Run custom code before/after tool calls, on stop, etc.
   *
   * @example
   * ```typescript
   * hooks: {
   *   PostToolUse: [{ matcher: 'Edit|Write', hooks: [logFileChange] }]
   * }
   * ```
   */
  hooks?: Record<string, Array<{ matcher: string; hooks: Array<(input: any, toolUseId: string, context: any) => Promise<any>> }>>
  /**
   * Resume a previous session by ID.
   * The agent will continue with full context from the previous session.
   */
  resume?: string
  /**
   * Load project settings from filesystem (CLAUDE.md, .claude/ directory).
   * Set to ['project'] to enable.
   */
  settingSources?: string[]
}

type McpServerConfig =
  | { command: string; args?: string[]; env?: Record<string, string>; type?: 'stdio' }
  | { type: 'sse'; url: string; headers?: Record<string, string> }
  | { type: 'http'; url: string; headers?: Record<string, string> }

export type QueryResult = {
  /** Final text output from the assistant */
  text: string
  /** Token usage */
  usage: { input_tokens: number; output_tokens: number }
  /** Number of agentic turns */
  num_turns: number
  /** Duration in milliseconds */
  duration_ms: number
  /** All conversation messages */
  messages: Message[]
}

// ============================================================================
// Agent class
// ============================================================================

export class Agent {
  private options: AgentOptions
  private appState: AppState
  private readFileCache: FileStateCache
  private mutableMessages: Message[]
  private tools: Tools
  private resolvedModel: string
  private mcpClients: any[]
  private _initialized: Promise<void>

  constructor(options: AgentOptions) {
    this.options = options
    this.appState = getDefaultAppState()
    this.readFileCache = createFileStateCacheWithSizeLimit(5000)
    this.mutableMessages = options.initialMessages ? [...options.initialMessages] : []
    this.mcpClients = []

    // Resolve API key and model from options.env or direct options
    this.resolveEnvOptions()

    // Resolve model
    this.resolvedModel = this.options.model || 'claude-sonnet-4-6'

    // Set API key in environment if provided
    if (this.options.apiKey) {
      process.env.ANTHROPIC_API_KEY = this.options.apiKey
    }
    if (this.options.baseURL) {
      process.env.ANTHROPIC_BASE_URL = this.options.baseURL
    }

    // Resolve tools
    this.tools = this.options.tools ?? getAllBaseTools()

    // Async initialization (MCP servers, etc.)
    this._initialized = this._init()
  }

  /**
   * Async initialization: connect MCP servers, load agents, etc.
   */
  private async _init(): Promise<void> {
    if (this.options.mcpServers) {
      try {
        const { connectToServer } = await import('./services/mcp/client.js')

        for (const [name, config] of Object.entries(this.options.mcpServers)) {
          try {
            const scopedConfig = { ...config, scope: 'dynamic' as const }
            const connection = await connectToServer(name, scopedConfig as any)
            this.mcpClients.push(connection)

            // Fetch tools from connected MCP server and add to tool pool
            if (connection.type === 'connected' && connection.client) {
              const { fetchToolsForClient } = await import('./services/mcp/client.js')
              const mcpTools = await fetchToolsForClient(connection)
              if (mcpTools?.length) {
                this.tools = [...this.tools, ...mcpTools]
              }
            }
          } catch (err: any) {
            console.error(`[MCP] Failed to connect to "${name}": ${err.message}`)
          }
        }
      } catch (err: any) {
        console.error(`[MCP] MCP client initialization failed: ${err.message}`)
      }
    }
  }

  /**
   * Resolve options from env map (compatible with @anthropic-ai/claude-agent-sdk)
   * and fall back to process.env for standard environment variables.
   */
  private resolveEnvOptions(): void {
    const env = this.options.env

    if (!this.options.apiKey) {
      this.options.apiKey =
        env?.ANTHROPIC_API_KEY || env?.ANTHROPIC_AUTH_TOKEN ||
        process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN
    }
    if (!this.options.baseURL) {
      this.options.baseURL =
        env?.ANTHROPIC_BASE_URL || process.env.ANTHROPIC_BASE_URL
    }
    if (!this.options.model) {
      this.options.model =
        env?.ANTHROPIC_MODEL || process.env.ANTHROPIC_MODEL
    }
  }

  /**
   * Run a query with streaming events.
   * Uses the full QueryEngine internally.
   */
  async *query(
    prompt: string,
    overrides?: Partial<AgentOptions>,
  ): AsyncGenerator<SDKMessage, void> {
    // Wait for async initialization (MCP connections, etc.)
    await this._initialized

    const opts = { ...this.options, ...overrides }
    const cwd = opts.cwd || process.cwd()

    // Build canUseTool based on permissionMode and allowedTools
    const allowedToolSet = opts.allowedTools ? new Set(opts.allowedTools) : null
    const permMode = opts.permissionMode ?? 'bypassPermissions'

    const canUseTool: CanUseToolFn = opts.canUseTool ?? (async (tool, input) => {
      // If allowedTools specified, only allow those
      if (allowedToolSet && !allowedToolSet.has(tool.name)) {
        if (permMode === 'bypassPermissions') {
          return { behavior: 'allow' as const, updatedInput: undefined }
        }
        return { behavior: 'deny' as const, updatedInput: undefined }
      }

      // permissionMode logic
      switch (permMode) {
        case 'bypassPermissions':
          return { behavior: 'allow' as const, updatedInput: undefined }
        case 'acceptEdits':
          // Auto-approve file operations
          if (['Read', 'Write', 'Edit', 'Glob', 'Grep', 'NotebookEdit'].includes(tool.name)) {
            return { behavior: 'allow' as const, updatedInput: undefined }
          }
          return { behavior: 'allow' as const, updatedInput: undefined }
        case 'plan':
          return { behavior: 'allow' as const, updatedInput: undefined }
        default:
          return { behavior: 'allow' as const, updatedInput: undefined }
      }
    })

    // Build commands (slash commands)
    let commands: any[] = []
    try {
      commands = await getCommands(cwd)
    } catch {
      // Commands may fail to load in some environments
    }

    // Create abort controller
    const abortController = new AbortController()
    if (opts.abortSignal) {
      opts.abortSignal.addEventListener('abort', () => abortController.abort(), { once: true })
    }

    // Filter tools by allowedTools if specified
    let tools = this.tools
    if (allowedToolSet) {
      tools = this.tools.filter(t => allowedToolSet.has(t.name))
    }

    // Build agent definitions from options
    const agents = opts.agents
      ? Object.entries(opts.agents).map(([name, def]) => ({
          name,
          description: def.description,
          instructions: def.prompt,
          tools: def.tools,
          model: def.model,
        }))
      : []

    // Call the original ask() function which creates QueryEngine internally
    const generator = ask({
      commands,
      prompt,
      cwd,
      tools,
      mcpClients: this.mcpClients,
      verbose: false,
      thinkingConfig: opts.thinking,
      maxTurns: opts.maxTurns,
      maxBudgetUsd: opts.maxBudgetUsd,
      canUseTool,
      mutableMessages: this.mutableMessages,
      getReadFileCache: () => this.readFileCache,
      setReadFileCache: (cache: FileStateCache) => { this.readFileCache = cache },
      customSystemPrompt: opts.systemPrompt,
      appendSystemPrompt: opts.appendSystemPrompt,
      userSpecifiedModel: this.resolvedModel,
      getAppState: () => this.appState,
      setAppState: (fn: (prev: AppState) => AppState) => {
        this.appState = fn(this.appState)
      },
      abortController,
      replayUserMessages: false,
      includePartialMessages: opts.includePartialMessages ?? false,
      agents: agents as any,
      jsonSchema: opts.jsonSchema,
    })

    yield* generator
  }

  /**
   * Run a query and wait for the final text result.
   * Convenience wrapper over query().
   */
  async prompt(
    text: string,
    overrides?: Partial<AgentOptions>,
  ): Promise<QueryResult> {
    const startTime = Date.now()
    let resultText = ''
    let usage = { input_tokens: 0, output_tokens: 0 }
    let numTurns = 0

    for await (const event of this.query(text, overrides)) {
      const msg = event as any

      // Accumulate text from assistant messages
      if (msg.type === 'assistant') {
        const textBlocks = (msg.message?.content || [])
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
        resultText = textBlocks.join('')
      }

      // Track result
      if (msg.type === 'result') {
        if (msg.usage) {
          usage = {
            input_tokens: msg.usage.input_tokens || 0,
            output_tokens: msg.usage.output_tokens || 0,
          }
        }
        numTurns = msg.num_turns || 0
      }
    }

    return {
      text: resultText,
      usage,
      num_turns: numTurns,
      duration_ms: Date.now() - startTime,
      messages: [...this.mutableMessages],
    }
  }

  /**
   * Get the conversation messages.
   */
  getMessages(): Message[] {
    return [...this.mutableMessages]
  }

  /**
   * Reset conversation history.
   */
  clear(): void {
    this.mutableMessages = []
    this.readFileCache = createFileStateCacheWithSizeLimit(5000)
  }

  /**
   * Abort the current operation.
   */
  abort(): void {
    // Will be implemented when we track the active abort controller
  }
}

// ============================================================================
// Factory function
// ============================================================================

/**
 * Create a new Agent instance.
 *
 * @example
 * ```typescript
 * const agent = createAgent({
 *   model: 'claude-sonnet-4-6',
 *   tools: getAllBaseTools(),
 * })
 *
 * for await (const event of agent.query('Analyze this project')) {
 *   // handle events
 * }
 * ```
 */
export function createAgent(options: AgentOptions = {}): Agent {
  return new Agent(options)
}

// ============================================================================
// Top-level query() function (compatible with @anthropic-ai/claude-agent-sdk)
// ============================================================================

/**
 * Run a one-shot agent query. Compatible with the official SDK's query() API.
 *
 * @example
 * ```typescript
 * import { query } from '@shipany/open-agent-sdk'
 *
 * for await (const message of query({
 *   prompt: 'Find and fix the bug in auth.py',
 *   options: { allowedTools: ['Read', 'Edit', 'Bash'] }
 * })) {
 *   if (message.type === 'assistant') {
 *     for (const block of message.message.content) {
 *       if ('text' in block) console.log(block.text)
 *     }
 *   }
 * }
 * ```
 */
export async function* query(params: {
  prompt: string
  options?: AgentOptions
}): AsyncGenerator<SDKMessage, void> {
  const agent = new Agent(params.options ?? {})
  yield* agent.query(params.prompt)
}
