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
    file: join(root, 'utils', 'imageResizer.js'),
    replacements: [
      {
        from: `        // Size-under-5MB does not imply dimensions-under-cap. Don't return the
        // raw buffer if the PNG header says it's oversized — fall through to
        // ImageResizeError instead. PNG sig is 8 bytes, IHDR dims at 16-24.
        const overDim = imageBuffer.length >= 24 &&
            imageBuffer[0] === 0x89 &&
            imageBuffer[1] === 0x50 &&
            imageBuffer[2] === 0x4e &&
            imageBuffer[3] === 0x47 &&
            (imageBuffer.readUInt32BE(16) > IMAGE_MAX_WIDTH ||
                imageBuffer.readUInt32BE(20) > IMAGE_MAX_HEIGHT);
        // If original image's base64 encoding is within API limit, allow it through uncompressed
        if (base64Size <= API_IMAGE_MAX_BASE64_SIZE && !overDim) {
            logEvent('tengu_image_resize_fallback', {
                original_size_bytes: originalSize,
                base64_size_bytes: base64Size,
                error_type: errorType,
            });
            return { buffer: imageBuffer, mediaType: normalizedExt };
        }
        // Image is too large and we failed to compress it - fail with user-friendly error
        throw new ImageResizeError(overDim
            ? \`Unable to resize image — dimensions exceed the \${IMAGE_MAX_WIDTH}x\${IMAGE_MAX_HEIGHT}px limit and image processing failed. \` +
                \`Please resize the image to reduce its pixel dimensions.\`
            : \`Unable to resize image (\${formatFileSize(originalSize)} raw, \${formatFileSize(base64Size)} base64). \` +
                \`The image exceeds the 5MB API limit and compression failed. \` +
                \`Please resize the image manually or use a smaller image.\`);`,
        to: `        // The API's real hard stop is the encoded payload size, not our local
        // 2000x2000 resize target. If local processing fails but the original
        // image is already within the API budget, pass it through untouched
        // instead of blocking the user on a best-effort resize failure.
        if (base64Size <= API_IMAGE_MAX_BASE64_SIZE) {
            logEvent('tengu_image_resize_fallback', {
                original_size_bytes: originalSize,
                base64_size_bytes: base64Size,
                error_type: errorType,
            });
            return { buffer: imageBuffer, mediaType: normalizedExt };
        }
        // Image is too large and we failed to compress it - fail with user-friendly error
        throw new ImageResizeError(\`Unable to resize image (\${formatFileSize(originalSize)} raw, \${formatFileSize(base64Size)} base64). \` +
            \`The image exceeds the 5MB API limit and compression failed. \` +
            \`Please resize the image manually or use a smaller image.\`);`,
      },
    ],
  },
  {
    file: join(root, 'tasks', 'LocalAgentTask', 'LocalAgentTask.js'),
    replacements: [
      {
        from: `export function updateProgressFromMessage(tracker, message, resolveActivityDescription, tools) {
    if (message.type !== 'assistant') {
        return;
    }
    const usage = message.message.usage;
    // Keep latest input (it's cumulative in the API), sum outputs
    tracker.latestInputTokens = usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
    tracker.cumulativeOutputTokens += usage.output_tokens;
    for (const content of message.message.content) {`,
        to: `export function updateProgressFromMessage(tracker, message, resolveActivityDescription, tools) {
    if (message.type !== 'assistant') {
        return;
    }
    const usage = message.message.usage;
    // Sub-agents can emit assistant-shaped error messages when the upstream
    // stream fails before usage arrives. Those messages still belong in the
    // transcript, but they should not crash progress tracking.
    if (usage) {
        // Keep latest input (it's cumulative in the API), sum outputs
        tracker.latestInputTokens = usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
        tracker.cumulativeOutputTokens += usage.output_tokens;
    }
    const contentBlocks = Array.isArray(message.message.content) ? message.message.content : [];
    for (const content of contentBlocks) {`,
      },
    ],
  },
  {
    file: join(root, 'tools', 'AgentTool', 'agentToolUtils.js'),
    replacements: [
      {
        from: `export function countToolUses(messages) {
    let count = 0;`,
        to: `function getLastAgentUsage(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (message?.type !== 'assistant')
            continue;
        const usage = message.message.usage;
        if (usage)
            return usage;
    }
    return {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        server_tool_use: {
            web_search_requests: 0,
            web_fetch_requests: 0,
        },
        service_tier: 'standard',
        cache_creation: {
            ephemeral_1h_input_tokens: 0,
            ephemeral_5m_input_tokens: 0,
        },
    };
}
export function countToolUses(messages) {
    let count = 0;`,
      },
      {
        from: `    const totalTokens = getTokenCountFromUsage(lastAssistantMessage.message.usage);
    const totalToolUseCount = countToolUses(agentMessages);`,
        to: `    const finalUsage = getLastAgentUsage(agentMessages);
    const totalTokens = getTokenCountFromUsage(finalUsage);
    const totalToolUseCount = countToolUses(agentMessages);`,
      },
      {
        from: `        usage: lastAssistantMessage.message.usage,`,
        to: `        usage: finalUsage,`,
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
    // Idempotency guard: several patches here use a `to` string that contains
    // the full `from` as a substring (we're prepending new code around an
    // existing block). That means after a successful patch, `from` still
    // matches the file, so a second run would append the new code *again* —
    // the root cause of the "Identifier 'getLastAgentUsage' has already been
    // declared" build failure people hit when `patch:sdk` ran more than once
    // on the same `node_modules`. Skip the replacement if the post-patch
    // content is already present.
    if (after.includes(to)) continue
    if (!after.includes(from)) continue
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
