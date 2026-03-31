#!/usr/bin/env node
import * as esbuild from 'esbuild'

// Plugin to stub out unavailable packages with empty modules
const stubPlugin = {
  name: 'stub-unavailable',
  setup(build) {
    // Packages that are optional / internal / platform-specific
    const stubPatterns = [
      // Anthropic internal
      /^@ant\//,
      /^@anthropic-ai\/sandbox-runtime/,
      /^@anthropic-ai\/bedrock-sdk/,
      /^@anthropic-ai\/foundry-sdk/,
      /^@anthropic-ai\/vertex-sdk/,
      /^@anthropic-ai\/mcpb/,
      // Cloud SDKs
      /^@aws-sdk\//,
      /^@azure\//,
      /^@smithy\//,
      // OpenTelemetry exporters
      /^@opentelemetry\/exporter-/,
      /^@opentelemetry\/exporter-prometheus/,
      // Native addons
      /^color-diff-napi$/,
      /^audio-capture-napi$/,
      /^modifiers-napi$/,
      // Optional packages
      /^fflate$/,
      /^qrcode$/,
      /^turndown$/,
      /^yaml$/,
    ]

    build.onResolve({ filter: /.*/ }, (args) => {
      for (const pattern of stubPatterns) {
        if (pattern.test(args.path)) {
          return { path: args.path, namespace: 'stub' }
        }
      }
      return null
    })

    build.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => {
      return {
        contents: `
          const noop = () => {};
          const noopClass = class {};
          const emptyArr = [];
          // Functions
          export const toString = noop;
          export const buildComputerUseTools = noop;
          export const createComputerUseMcpServer = noop;
          export const createClaudeForChromeMcpServer = noop;
          export const bindSessionContext = noop;
          export const getSentinelCategory = noop;
          export const targetImageSize = noop;
          export const getSyntaxTheme = noop;
          export const getMcpConfigForManifest = noop;
          // Classes
          export const SandboxManager = class {
            static getSandboxUnavailableReason() { return undefined; }
            static isSandboxRequired() { return false; }
            static isSandboxingEnabled() { return false; }
            static async initialize() {}
          };
          export const ColorDiff = noopClass;
          export const ColorFile = noopClass;
          export const McpbManifestSchema = {};
          // Constants
          export const BROWSER_TOOLS = [];
          export const DEFAULT_GRANT_FLAGS = {};
          export const API_RESIZE_PARAMS = {};
          // Default
          export default {};
        `,
        loader: 'js',
      }
    })
  },
}

await esbuild.build({
  entryPoints: ['src/entrypoints/cli.tsx'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'cli.mjs',
  target: 'node18',
  banner: {
    js: [
      '#!/usr/bin/env node',
      'import { createRequire as __createRequire } from "module";',
      'const require = __createRequire(import.meta.url);',
    ].join('\n'),
  },
  loader: {
    '.md': 'text',
    '.txt': 'text',
  },
  mainFields: ['module', 'main'],
  inject: ['src/shims/globals.js'],
  plugins: [stubPlugin],
  external: [
    // True native addons that can't be bundled
    'fsevents',
    'cpu-features',
    'ssh2',
    'sharp',
  ],
  logLevel: 'warning',
})

console.log('✅ CLI bundled to cli.mjs')
