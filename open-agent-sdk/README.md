# Open Agent SDK

[![npm](https://img.shields.io/npm/v/@shipany/open-agent-sdk.svg?style=flat-square)](https://www.npmjs.com/package/@shipany/open-agent-sdk) ![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen?style=flat-square) ![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)

Open Agent SDK is an open-source Agent SDK inspired by [`@anthropic-ai/claude-agent-sdk`](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk). Build autonomous AI agents that can understand codebases, edit files, run commands, search the web, and execute complex multi-step workflows.

Unlike the official `@anthropic-ai/claude-agent-sdk` which requires a local Claude Code CLI process, **Open Agent SDK runs the full agent loop in-process** — deploy anywhere: cloud servers, serverless functions, Docker containers, CI/CD pipelines.

## Get started

```sh
npm install @shipany/open-agent-sdk
```

Set your API key:

```sh
export ANTHROPIC_API_KEY=your-api-key
```

Or use a third-party provider like [OpenRouter](https://openrouter.ai/):

```sh
export ANTHROPIC_BASE_URL=https://openrouter.ai/api
export ANTHROPIC_API_KEY=your-openrouter-api-key
export ANTHROPIC_MODEL=anthropic/claude-sonnet-4-6
```

## Quick start

### One-shot query (compatible with official SDK)

```typescript
import { query } from '@shipany/open-agent-sdk'

for await (const message of query({
  prompt: 'Find and fix the bug in auth.py',
  options: {
    allowedTools: ['Read', 'Edit', 'Bash'],
    permissionMode: 'acceptEdits',
  },
})) {
  if (message.type === 'assistant' && message.message?.content) {
    for (const block of message.message.content) {
      if ('text' in block) console.log(block.text)
      else if ('name' in block) console.log(`Tool: ${block.name}`)
    }
  } else if (message.type === 'result') {
    console.log(`Done: ${message.subtype}`)
  }
}
```

### Simple prompt (blocking)

```typescript
import { createAgent } from '@shipany/open-agent-sdk'

const agent = createAgent({ model: 'claude-sonnet-4-6' })
const result = await agent.prompt('Read package.json and tell me the project name')

console.log(result.text)
console.log(`Tokens: ${result.usage.input_tokens + result.usage.output_tokens}`)
```

### Multi-turn session

```typescript
import { createAgent } from '@shipany/open-agent-sdk'

const agent = createAgent({
  model: 'claude-sonnet-4-6',
  systemPrompt: 'You are a senior software engineer. Be concise.',
})

const r1 = await agent.prompt('Read the main entry point and explain the architecture')
console.log(r1.text)

// Full context from turn 1 is preserved
const r2 = await agent.prompt('Now refactor the error handling')
console.log(r2.text)
```

### Custom tools

```typescript
import { createAgent, getAllBaseTools } from '@shipany/open-agent-sdk'

const weatherTool = {
  name: 'GetWeather',
  description: 'Get weather for a city',
  inputJSONSchema: {
    type: 'object',
    properties: { city: { type: 'string' } },
    required: ['city'],
  },
  get inputSchema() { return { safeParse: (v) => ({ success: true, data: v }) } },
  async prompt() { return this.description },
  async call(input) { return { data: `Weather in ${input.city}: 22°C, sunny` } },
  userFacingName: () => 'GetWeather',
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  mapToolResultToToolResultBlockParam: (data, id) => ({
    type: 'tool_result', tool_use_id: id, content: data,
  }),
}

const agent = createAgent({
  tools: [...getAllBaseTools(), weatherTool],
})

const result = await agent.prompt('What is the weather in Tokyo?')
```

### MCP server integration

```typescript
import { createAgent } from '@shipany/open-agent-sdk'

const agent = createAgent({
  mcpServers: {
    filesystem: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    },
    playwright: {
      command: 'npx',
      args: ['@playwright/mcp@latest'],
    },
  },
})

const result = await agent.prompt('List files in /tmp')
```

### Subagents

```typescript
import { query } from '@shipany/open-agent-sdk'

for await (const message of query({
  prompt: 'Use the code-reviewer agent to review this codebase',
  options: {
    allowedTools: ['Read', 'Glob', 'Grep', 'Agent'],
    agents: {
      'code-reviewer': {
        description: 'Expert code reviewer for quality and security.',
        prompt: 'Analyze code quality and suggest improvements.',
        tools: ['Read', 'Glob', 'Grep'],
      },
    },
  },
})) {
  // handle messages...
}
```

### Permissions

```typescript
import { query } from '@shipany/open-agent-sdk'

// Read-only agent: can only analyze, not modify
for await (const message of query({
  prompt: 'Review this code for best practices',
  options: {
    allowedTools: ['Read', 'Glob', 'Grep'],
  },
})) {
  // ...
}
```

## API reference

### `query({ prompt, options })`

Top-level entry point, compatible with `@anthropic-ai/claude-agent-sdk`. Returns an `AsyncGenerator<SDKMessage>`.

### `createAgent(options)`

Create a reusable agent with persistent session state.

- `agent.query(prompt)` — streaming response (`AsyncGenerator`)
- `agent.prompt(prompt)` — blocking response (`Promise<QueryResult>`)
- `agent.getMessages()` — conversation history
- `agent.clear()` — reset session

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | `string` | `claude-sonnet-4-6` | Claude model ID |
| `apiKey` | `string` | `env.ANTHROPIC_API_KEY` | API key |
| `baseURL` | `string` | Anthropic API | API base URL (for third-party providers) |
| `cwd` | `string` | `process.cwd()` | Working directory for tools |
| `systemPrompt` | `string` | — | Custom system prompt |
| `tools` | `Tool[]` | All built-in | Available tools |
| `allowedTools` | `string[]` | — | Tool whitelist (e.g. `['Read', 'Glob']`) |
| `permissionMode` | `string` | `bypassPermissions` | `acceptEdits` / `bypassPermissions` / `plan` / `default` |
| `maxTurns` | `number` | `100` | Max agentic turns |
| `maxBudgetUsd` | `number` | — | Max USD spend |
| `mcpServers` | `object` | — | MCP server configurations |
| `agents` | `object` | — | Custom subagent definitions |
| `hooks` | `object` | — | Lifecycle hooks (PreToolUse, PostToolUse, Stop, etc.) |
| `thinking` | `object` | — | Extended thinking configuration |
| `env` | `object` | — | Environment variables (compatible with official SDK) |
| `resume` | `string` | — | Resume a previous session by ID |
| `canUseTool` | `function` | — | Custom permission callback |
| `includePartialMessages` | `boolean` | `false` | Include raw streaming events |

### Environment variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | API key |
| `ANTHROPIC_BASE_URL` | API base URL (for third-party providers like OpenRouter) |
| `ANTHROPIC_MODEL` | Default model |

Also supports `options.env` for passing environment variables programmatically, same as the official SDK.

## Built-in tools

| Tool | Description |
|------|-------------|
| `Read` | Read files with line numbers, images, PDFs |
| `Write` | Create or overwrite files |
| `Edit` | Precise string replacement in files |
| `Bash` | Execute shell commands |
| `Glob` | Find files by pattern |
| `Grep` | Search file contents with regex (ripgrep) |
| `WebFetch` | Fetch and parse web content |
| `WebSearch` | Search the web |
| `Agent` | Spawn subagents for parallel work |
| `NotebookEdit` | Edit Jupyter notebooks |
| `Skill` | Invoke custom skills |
| `AskUserQuestion` | Ask the user clarifying questions |
| `TodoWrite` | Create/manage todo lists |
| `ToolSearch` | Search available tools |
| `SendMessage` | Send messages to agents/teammates |
| `TeamCreate` / `TeamDelete` | Create/delete agent teams |
| `EnterPlanMode` / `ExitPlanMode` | Plan approval mode |
| `EnterWorktree` / `ExitWorktree` | Git worktree isolation |
| `ListMcpResources` / `ReadMcpResource` | MCP resource access |
| `TaskCreate` / `TaskUpdate` / `TaskList` / `TaskGet` / `TaskStop` / `TaskOutput` | Task management |

## Architecture

The official `@anthropic-ai/claude-agent-sdk` architecture:

```
Your code → SDK → spawn cli.js subprocess → stdin/stdout JSON → Anthropic API
```

**Open Agent SDK** runs everything in-process:

```
Your code → SDK → QueryEngine → Anthropic API (direct)
```

### What's under the hood

This SDK contains the **complete Claude Code engine** (2,000+ source files), not a simplified reimplementation:

| Component | Description |
|-----------|-------------|
| **System Prompt** | Full prompt construction with static/dynamic boundary caching |
| **Permission System** | 4-layer pipeline: rules → low-risk skip → whitelist → AI classifier + circuit breaker |
| **Memory System** | Auto-memory with 4 types (user/feedback/project/reference), autoDream background organizer |
| **Context Compression** | 9-segment structured extraction (autocompact, microcompact, snip compact) |
| **Multi-Agent** | Leader/Teammate teams, Git worktree isolation, permission bubbling, async mailbox |
| **MCP Client** | Full MCP support: stdio, SSE, HTTP transports |
| **Search** | ripgrep + glob (same as Claude Code — no vector DB needed) |
| **Tool Execution** | Concurrent batching for read-only tools, serial for mutations |
| **API Client** | Streaming, retry with exponential backoff, fallback models, prompt caching |

## Comparison with `@anthropic-ai/claude-agent-sdk`

| | Official SDK | Open Agent SDK |
|---|---|---|
| **Architecture** | Spawns local CLI subprocess | In-process agent loop |
| **Cloud deployment** | Requires CLI installed | Works anywhere |
| **Serverless** | Not supported | Fully supported |
| **Docker** | Needs CLI in image | Just `npm install` |
| **API surface** | `query()`, `tool()`, sessions | `query()`, `createAgent()`, sessions |
| **Built-in tools** | 26 tools | 26 tools (same set) |
| **System prompt** | Full engine | Full engine (same code) |
| **Permission system** | 4-layer + AI classifier | 4-layer + AI classifier (same code) |
| **Memory system** | Auto-memory + autoDream | Auto-memory + autoDream (same code) |
| **Context compression** | 9-segment structured | 9-segment structured (same code) |
| **Multi-agent** | Teams, worktrees | Teams, worktrees (same code) |
| **MCP support** | Full | Full (same code) |
| **Custom tools** | Via MCP | Native function tools + MCP |
| **Streaming** | Via subprocess stdio | Direct API streaming |

## Examples

See the [`examples/`](./examples) directory:

| # | Example | What it demonstrates |
|---|---------|---------------------|
| 01 | [Simple Query](./examples/01-simple-query.ts) | Streaming with `createAgent().query()` |
| 02 | [Multi-Tool](./examples/02-multi-tool.ts) | Glob + Bash orchestration |
| 03 | [Multi-Turn](./examples/03-multi-turn.ts) | Session persistence across turns |
| 04 | [Prompt API](./examples/04-prompt-api.ts) | Blocking `agent.prompt()` |
| 05 | [System Prompt](./examples/05-custom-system-prompt.ts) | Custom system prompt |
| 06 | [MCP Server](./examples/06-mcp-server.ts) | MCP stdio transport |
| 07 | [Custom Tools](./examples/07-custom-tools.ts) | User-defined tools |
| 08 | [Official API](./examples/08-official-api-compat.ts) | `query()` drop-in compatible |
| 09 | [Subagents](./examples/09-subagents.ts) | Agent delegation |
| 10 | [Permissions](./examples/10-permissions.ts) | Read-only agent |

Run any example:

```sh
npx tsx examples/01-simple-query.ts
```

## Reporting bugs

File issues at [github.com/shipany-ai/open-agent-sdk/issues](https://github.com/shipany-ai/open-agent-sdk/issues).

## Contributors

<a href="https://github.com/shipany-ai/open-agent-sdk/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=shipany-ai/open-agent-sdk" />
</a>

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=shipany-ai/open-agent-sdk&type=Timeline)](https://star-history.com/#shipany-ai/open-agent-sdk&Timeline)

## License

MIT
