import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const root = join(process.cwd(), 'node_modules', '@shipany', 'open-agent-sdk', 'dist')

const patches = [
  {
    file: join(root, 'ink', 'components', 'Box.js'),
    replacements: [
      {
        from: "import '../global.d.ts';",
        to: "import '../global.js';",
      },
    ],
  },
  {
    file: join(root, 'ink', 'components', 'ScrollBox.js'),
    replacements: [
      {
        from: "import '../global.d.ts';",
        to: "import '../global.js';",
      },
    ],
  },
  {
    file: join(root, 'agent.js'),
    replacements: [
      {
        from: `        this.readFileCache = createFileStateCacheWithSizeLimit(5000);
        this.mutableMessages = [];
        this.mcpClients = [];`,
        to: `        this.readFileCache = createFileStateCacheWithSizeLimit(5000);
        this.mutableMessages = Array.isArray(options.initialMessages) ? [...options.initialMessages] : [];
        this.mcpClients = [];`,
      },
    ],
  },
  {
    file: join(root, 'agent.d.ts'),
    replacements: [
      {
        from: `    /** Append to default system prompt */
    appendSystemPrompt?: string;
    /** Available tools. Defaults to all built-in tools. */`,
        to: `    /** Append to default system prompt */
    appendSystemPrompt?: string;
    /** Initial transcript messages for session resume */
    initialMessages?: Message[];
    /** Available tools. Defaults to all built-in tools. */`,
      },
    ],
  },
  {
    file: join(root, 'constants', 'prompts.js'),
    replacements: [
      {
        from: `You are an interactive agent that helps users \${outputStyleConfig !== null ? 'according to your "Output Style" below, which describes how you should respond to user queries.' : 'with software engineering tasks.'} Use the instructions below and the tools available to you to assist the user.

\${CYBER_RISK_INSTRUCTION}
IMPORTANT: You must NEVER generate or guess URLs for the user unless you are confident that the URLs are for helping the user with programming. You may use URLs provided by the user in their messages or local files.`,
        to: `You are OpenClaude, a versatile AI assistant with powerful coding tools. You help users with any task — coding, general knowledge, research, creative writing, analysis, recommendations, and more. \${outputStyleConfig !== null ? 'Follow your "Output Style" below, which describes how you should respond to user queries.' : ''} Use the instructions below and the tools available to you to assist the user. Always respond in the same language the user uses.

\${CYBER_RISK_INSTRUCTION}
You may provide well-known URLs when the user asks (official websites, documentation, etc.). Only decline if you genuinely do not know the URL.`,
      },
      {
        from: `The user will primarily request you to perform software engineering tasks. These may include solving bugs, adding new functionality, refactoring code, explaining code, and more. When given an unclear or generic instruction, consider it in the context of these software engineering tasks and the current working directory. For example, if the user asks you to change "methodName" to snake case, do not reply with just "method_name", instead find the method in the code and modify the code.`,
        to: `The user may request coding tasks (solving bugs, adding features, refactoring, explaining code) or general questions on any topic. When a request is clearly about code, consider it in the context of the current working directory. For example, if the user asks you to change "methodName" to snake case, find the method in the code and modify it. When the request is not about code, answer it directly and helpfully without redirecting to software engineering.`,
      },
    ],
  },
  {
    file: join(root, 'agent.js'),
    replacements: [
      {
        from: `                        const connection = await connectToServer(name, scopedConfig);
                        this.mcpClients.push(connection);
                        // Fetch tools from connected MCP server and add to tool pool
                        if (connection.status === 'connected' && connection.client) {
                            const { fetchToolsForClient } = await import('./services/mcp/client.js');
                            const mcpTools = await fetchToolsForClient(connection);
                            if (mcpTools?.length) {
                                this.tools = [...this.tools, ...mcpTools];
                            }
                        }`,
        to: `                        const connection = await connectToServer(name, scopedConfig);
                        this.mcpClients.push(connection);
                        console.log(\`[MCP] Server "\${name}" status: \${connection.type}\`);
                        // Fetch tools from connected MCP server and add to tool pool
                        if (connection.type === 'connected' && connection.client) {
                            const { fetchToolsForClient } = await import('./services/mcp/client.js');
                            const mcpTools = await fetchToolsForClient(connection);
                            console.log(\`[MCP] Server "\${name}" loaded \${mcpTools?.length ?? 0} tools\`);
                            if (mcpTools?.length) {
                                this.tools = [...this.tools, ...mcpTools];
                            }
                        } else {
                            console.log(\`[MCP] Server "\${name}" not connected, skipping tool fetch (status: \${connection.type}, hasClient: \${!!connection.client})\`);
                        }`,
      },
      {
        from: `                        const connection = await connectToServer(name, scopedConfig);
                        this.mcpClients.push(connection);
                        console.log(\`[MCP] Server "\${name}" status: \${connection.status}\`);
                        // Fetch tools from connected MCP server and add to tool pool
                        if (connection.status === 'connected' && connection.client) {
                            const { fetchToolsForClient } = await import('./services/mcp/client.js');
                            const mcpTools = await fetchToolsForClient(connection);
                            console.log(\`[MCP] Server "\${name}" loaded \${mcpTools?.length ?? 0} tools\`);
                            if (mcpTools?.length) {
                                this.tools = [...this.tools, ...mcpTools];
                            }
                        } else {
                            console.log(\`[MCP] Server "\${name}" not connected, skipping tool fetch (status: \${connection.status}, hasClient: \${!!connection.client})\`);
                        }`,
        to: `                        const connection = await connectToServer(name, scopedConfig);
                        this.mcpClients.push(connection);
                        console.log(\`[MCP] Server "\${name}" status: \${connection.type}\`);
                        // Fetch tools from connected MCP server and add to tool pool
                        if (connection.type === 'connected' && connection.client) {
                            const { fetchToolsForClient } = await import('./services/mcp/client.js');
                            const mcpTools = await fetchToolsForClient(connection);
                            console.log(\`[MCP] Server "\${name}" loaded \${mcpTools?.length ?? 0} tools\`);
                            if (mcpTools?.length) {
                                this.tools = [...this.tools, ...mcpTools];
                            }
                        } else {
                            console.log(\`[MCP] Server "\${name}" not connected, skipping tool fetch (status: \${connection.type}, hasClient: \${!!connection.client})\`);
                        }`,
      },
    ],
  },
  {
    file: join(root, 'utils', 'betas.js'),
    replacements: [
      {
        from: `export const getAllModelBetas = memoize((model) => {
    const betaHeaders = [];
    const isHaiku = getCanonicalName(model).includes('haiku');`,
        to: `export const getAllModelBetas = memoize((model) => {
    if (typeof model === 'string' && !model.startsWith('anthropic/') && !model.startsWith('claude')) {
        return [];
    }
    const betaHeaders = [];
    const isHaiku = getCanonicalName(model).includes('haiku');`,
      },
    ],
  },
  {
    file: join(root, 'utils', 'messages.js'),
    replacements: [
      {
        from: `                if (typeof contentBlock.input === 'string') {
                    const parsed = safeParseJSON(contentBlock.input);
                    if (parsed === null && contentBlock.input.length > 0) {
                        // TET/FC-v3 diagnostic: the streamed tool input JSON failed to
                        // parse. We fall back to {} which means downstream validation
                        // sees empty input. The raw prefix goes to debug log only — no
                        // PII-tagged proto column exists for it yet.
                        logEvent('tengu_tool_input_json_parse_fail', {
                            toolName: sanitizeToolNameForAnalytics(contentBlock.name),
                            inputLen: contentBlock.input.length,
                        });
                        if (process.env.USER_TYPE === 'ant') {
                            logForDebugging(\`tool input JSON parse fail: \${contentBlock.input.slice(0, 200)}\`, { level: 'warn' });
                        }
                    }
                    normalizedInput = parsed ?? {};
                }`,
        to: `                if (typeof contentBlock.input === 'string') {
                    const parsed = safeParseJSON(contentBlock.input);
                    if (parsed === null && contentBlock.input.length > 0) {
                        logEvent('tengu_tool_input_json_parse_fail', {
                            toolName: sanitizeToolNameForAnalytics(contentBlock.name),
                            inputLen: contentBlock.input.length,
                        });
                        if (process.env.USER_TYPE === 'ant') {
                            logForDebugging(\`tool input JSON parse fail: \${contentBlock.input.slice(0, 200)}\`, { level: 'warn' });
                        }
                        const error = new Error(\`Tool input JSON parse failed for \${contentBlock.name}\`);
                        error.name = 'ToolInputJSONParseError';
                        throw error;
                    }
                    normalizedInput = parsed ?? {};
                }`,
      },
    ],
  },
  {
    file: join(root, 'tools', 'FileWriteTool', 'prompt.js'),
    replacements: [
      {
        from: `export function getWriteToolDescription() {
    return \`Writes a file to the local filesystem.

Usage:
- This tool will overwrite the existing file if there is one at the provided path.\${getPreReadInstruction()}
- Prefer the Edit tool for modifying existing files \\u2014 it only sends the diff. Only use this tool to create new files or for complete rewrites.
- NEVER create documentation files (*.md) or README files unless explicitly requested by the User.
- Only use emojis if the user explicitly requests it. Avoid writing emojis to files unless asked.\`;
}`,
        to: `export function getWriteToolDescription() {
    return \`Writes a file to the local filesystem.

Usage:
- This tool will overwrite the existing file if there is one at the provided path.\${getPreReadInstruction()}
- Prefer the Edit tool for modifying existing files \\u2014 it only sends the diff. Only use this tool to create new files or for complete rewrites.
- Avoid sending a huge full-file body in one Write call when a smaller strategy would work. For large files, prefer writing a small scaffold first and then using Edit in smaller chunks, or generate repetitive content with compact Bash/Python code instead of pasting the whole file into the tool input.
- NEVER create documentation files (*.md) or README files unless explicitly requested by the User.
- Only use emojis if the user explicitly requests it. Avoid writing emojis to files unless asked.\`;
}`,
      },
    ],
  },
  {
    file: join(root, 'services', 'tools', 'toolExecution.js'),
    replacements: [
      {
        from: `}
async function checkPermissionsAndCallTool(tool, toolUseID, input, toolUseContext, canUseTool, assistantMessage, messageId, requestId, mcpServerType, mcpServerBaseUrl, onToolProgress) {`,
        to: `}
function buildLargeWriteTruncationHint(tool, input) {
    if (tool.name !== 'Write')
        return null;
    const hasFilePath = typeof input.file_path === 'string' && input.file_path.length > 0;
    const hasContent = typeof input.content === 'string' && input.content.length > 0;
    if (hasFilePath || hasContent)
        return null;
    return ('\\n\\nThis often means your API provider truncated a large Write tool payload and returned an empty input object. ' +
        'Do not retry the same full-file Write. Instead, write a small scaffold first and then use Edit in smaller chunks, ' +
        'or use compact Bash/Python code to generate repetitive content without putting the entire file into one tool argument.');
}
// OpenClaude patch: large Write truncation recovery
async function checkPermissionsAndCallTool(tool, toolUseID, input, toolUseContext, canUseTool, assistantMessage, messageId, requestId, mcpServerType, mcpServerBaseUrl, onToolProgress) {`,
      },
      {
        from: `        if (schemaHint) {
            logEvent('tengu_deferred_tool_schema_not_sent', {
                toolName: sanitizeToolNameForAnalytics(tool.name),
                isMcp: tool.isMcp ?? false,
            });
            errorContent += schemaHint;
        }
        logForDebugging(\`\${tool.name} tool input error: \${errorContent.slice(0, 200)}\`);`,
        to: `        if (schemaHint) {
            logEvent('tengu_deferred_tool_schema_not_sent', {
                toolName: sanitizeToolNameForAnalytics(tool.name),
                isMcp: tool.isMcp ?? false,
            });
            errorContent += schemaHint;
        }
        const largeWriteHint = buildLargeWriteTruncationHint(tool, input);
        if (largeWriteHint) {
            errorContent += largeWriteHint;
        }
        logForDebugging(\`\${tool.name} tool input error: \${errorContent.slice(0, 200)}\`);`,
      },
    ],
  },
  {
    file: join(root, 'constants', 'outputStyles.js'),
    replacements: [
      {
        from: `You are an interactive CLI tool that helps users with software engineering tasks. In addition to software engineering tasks, you should provide educational insights about the codebase along the way.`,
        to: `You are a versatile AI assistant with powerful coding tools. When the user is working on code, provide educational insights about the codebase along the way.`,
      },
      {
        from: `You are an interactive CLI tool that helps users with software engineering tasks. In addition to software engineering tasks, you should help users learn more about the codebase through hands-on practice and educational insights.`,
        to: `You are a versatile AI assistant with powerful coding tools. When the user is working on code, you should help them learn more about the codebase through hands-on practice and educational insights.`,
      },
    ],
  },
]

let patchedFiles = 0

for (const { file, replacements } of patches) {
  if (!existsSync(file)) continue

  let before = readFileSync(file, 'utf8')
  let after = before

  for (const { from, to } of replacements) {
    after = after.replace(from, to)
  }

  if (after !== before) {
    writeFileSync(file, after)
    patchedFiles += 1
  }
}

if (patchedFiles > 0) {
  console.log(`[patch-open-agent-sdk] patched ${patchedFiles} files`)
} else {
  console.log('[patch-open-agent-sdk] no changes needed')
}
