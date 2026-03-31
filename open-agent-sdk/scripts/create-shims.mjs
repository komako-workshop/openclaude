#!/usr/bin/env node
/**
 * Creates stub/shim packages for optional dependencies that are not available.
 * These are Anthropic-internal packages, cloud SDKs, native addons, etc.
 * Run automatically after npm install via postinstall hook.
 */
import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const nodeModules = join(import.meta.dirname, '..', 'node_modules')

const noop = 'function noop() {}'
const noopAsync = 'async function noopAsync() {}'
const noopClass = 'class NoopClass {}'

// Map of package name to module source code
const shims = {
  'color-diff-napi': `
export class ColorDiff {}
export class ColorFile {}
export function getSyntaxTheme() { return {}; }
export default {};
`,
  '@ant/computer-use-mcp': `
export const BROWSER_TOOLS = [];
export const API_RESIZE_PARAMS = {};
export const DEFAULT_GRANT_FLAGS = {};
export function buildComputerUseTools() { return []; }
export function createComputerUseMcpServer() {}
export function bindSessionContext() {}
export function targetImageSize() {}
export function getSentinelCategory() {}
export default {};
`,
  '@ant/computer-use-swift': `export default {};`,
  '@ant/computer-use-input': `export default {};`,
  '@ant/claude-for-chrome-mcp': `
export const BROWSER_TOOLS = [];
export function createClaudeForChromeMcpServer() {}
export default {};
`,
  '@anthropic-ai/sandbox-runtime': `
export class SandboxManager {
  static getSandboxUnavailableReason() { return undefined; }
  static isSandboxRequired() { return false; }
  static isSandboxingEnabled() { return false; }
  static async initialize() {}
  static getDependencyChecks() { return []; }
}
export class SandboxViolationStore {
  getViolations() { return []; }
  clear() {}
}
export const SandboxRuntimeConfigSchema = { parse: (x) => x, safeParse: (x) => ({ success: true, data: x }) };
export default {};
`,
  '@anthropic-ai/bedrock-sdk': `
export class AnthropicBedrock { constructor() {} }
export default AnthropicBedrock;
`,
  '@anthropic-ai/foundry-sdk': `
export class AnthropicFoundry { constructor() {} }
export default AnthropicFoundry;
`,
  '@anthropic-ai/vertex-sdk': `
export class AnthropicVertex { constructor() {} }
export default AnthropicVertex;
`,
  '@anthropic-ai/mcpb': `
export const McpbManifestSchema = { parse: (x) => x, safeParse: (x) => ({ success: true, data: x }) };
export function getMcpConfigForManifest() { return {}; }
export default {};
`,
  '@aws-sdk/client-bedrock': `
export class BedrockClient { async send() { return {}; } }
export class ListInferenceProfilesCommand { constructor() {} }
export class GetInferenceProfileCommand { constructor() {} }
export class ListFoundationModelsCommand { constructor() {} }
export default {};
`,
  '@aws-sdk/client-bedrock-runtime': `
export class BedrockRuntimeClient { async send() { return {}; } }
export class CountTokensCommand { constructor() {} }
export default {};
`,
  '@aws-sdk/client-sts': `
export class STSClient { async send() { return {}; } }
export class GetCallerIdentityCommand { constructor() {} }
export default {};
`,
  '@aws-sdk/credential-provider-node': `
export function defaultProvider() { return async () => ({}); }
export default {};
`,
  '@azure/identity': `
export class DefaultAzureCredential {}
export function getBearerTokenProvider() { return async () => ''; }
export default {};
`,
  '@smithy/core': `
export class NoAuthSigner { async sign(req) { return req; } }
export const middleware = {};
export default {};
`,
  '@smithy/node-http-handler': `
export class NodeHttpHandler { constructor() {} }
export default {};
`,
  'audio-capture-napi': `export default {};`,
  'modifiers-napi': `export default {};`,
  'fflate': `
export function zipSync() { return new Uint8Array(); }
export function unzipSync() { return {}; }
export default {};
`,
  'qrcode': `
export function toString() { return Promise.resolve(''); }
export default { toString };
`,
  'yaml': `
export function parse(s) { return {}; }
export function stringify(o) { return ''; }
export default { parse, stringify };
`,
}

// OpenTelemetry exporters - all follow the same pattern
for (const suffix of [
  'logs-otlp-grpc', 'logs-otlp-http', 'logs-otlp-proto',
  'metrics-otlp-grpc', 'metrics-otlp-http', 'metrics-otlp-proto',
  'prometheus',
  'trace-otlp-grpc', 'trace-otlp-http', 'trace-otlp-proto',
]) {
  const name = `@opentelemetry/exporter-${suffix}`
  const className = suffix.includes('metrics') ? 'OTLPMetricExporter'
    : suffix.includes('logs') ? 'OTLPLogExporter'
    : suffix.includes('prometheus') ? 'PrometheusExporter'
    : 'OTLPTraceExporter'
  shims[name] = `
export class ${className} { constructor() {} shutdown() { return Promise.resolve(); } }
export default {};
`
}

let created = 0
for (const [pkg, source] of Object.entries(shims)) {
  const dir = join(nodeModules, pkg)
  if (existsSync(join(dir, 'package.json'))) continue
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({
      name: pkg,
      version: '0.0.0',
      type: 'module',
      main: 'index.js',
      exports: {
        '.': { import: './index.js', default: './index.js' },
        './*': { import: './index.js', default: './index.js' },
      },
    }),
  )
  writeFileSync(join(dir, 'index.js'), source.trim() + '\n')
  created++
}
if (created > 0) {
  console.log(`Created ${created} shim packages for optional dependencies`)
}
