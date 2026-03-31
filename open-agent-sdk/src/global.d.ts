/**
 * Global type declarations for external modules that are not installed
 * as direct dependencies. These stubs allow the TypeScript build to pass
 * without pulling in every optional / internal / native package.
 *
 * All exports use `any` liberally — correctness is not the goal here,
 * just making `tsc --noEmit` happy.
 */

// ---------------------------------------------------------------------------
// React compiler runtime (used by React compiler transform)
// ---------------------------------------------------------------------------
declare module 'react/compiler-runtime' {
  const c: any;
  export { c };
  export default c;
}

// ---------------------------------------------------------------------------
// Bun build-time macros
// ---------------------------------------------------------------------------
declare module 'bun:bundle' {
  export function feature(name: string): boolean;
  export function embed(path: string): any;
  export const MACRO: any;
}

// Global MACRO constant (injected by Bun bundler at build time)
declare const MACRO: any;
declare const Gates: any;
declare const Bun: any;

declare module 'bun:ffi' {
  export function dlopen(path: string, symbols: any): any;
  export function ptr(buf: any): any;
  export const FFIType: any;
  export const suffix: string;
}

// ---------------------------------------------------------------------------
// usehooks-ts
// ---------------------------------------------------------------------------
declare module 'usehooks-ts' {
  export function useInterval(callback: () => void, delay: number | null): void;
  export function useDebounceCallback(callback: (...args: any[]) => any, delay: number): any;
  export function useEventCallback<T extends (...args: any[]) => any>(fn: T): T;
}

// ---------------------------------------------------------------------------
// OpenTelemetry — API
// ---------------------------------------------------------------------------
declare module '@opentelemetry/api' {
  export const trace: any;
  export const context: any;
  export const diag: any;
  export const DiagLogLevel: any;
  export const SpanStatusCode: any;
  export type Span = any;
  export type Tracer = any;
  export type Attributes = Record<string, any>;
  export type HrTime = [number, number];
  export type DiagLogger = any;
  export type Meter = any;
  export type MetricOptions = any;
}

declare module '@opentelemetry/api-logs' {
  export const logs: any;
  export type Logger = any;
  export type LoggerProvider = any;
  export type AnyValueMap = Record<string, any>;
}

declare module '@opentelemetry/core' {
  export const ExportResultCode: { SUCCESS: number; FAILED: number };
  export type ExportResult = { code: number; error?: Error };
}

declare module '@opentelemetry/resources' {
  export function resourceFromAttributes(attrs: any): any;
  export const envDetector: any;
  export const hostDetector: any;
  export const osDetector: any;
}

declare module '@opentelemetry/semantic-conventions' {
  export const ATTR_SERVICE_NAME: string;
  export const ATTR_SERVICE_VERSION: string;
  export const SEMRESATTRS_HOST_ARCH: string;
}

// ---------------------------------------------------------------------------
// OpenTelemetry — SDK
// ---------------------------------------------------------------------------
declare module '@opentelemetry/sdk-logs' {
  export class LoggerProvider {
    constructor(config?: any);
    addLogRecordProcessor(processor: any): void;
    getLogger(name: string): any;
    shutdown(): Promise<void>;
    forceFlush(): Promise<void>;
  }
  export class SimpleLogRecordProcessor {
    constructor(exporter: any);
  }
  export class BatchLogRecordProcessor {
    constructor(exporter: any, config?: any);
  }
  export class ConsoleLogRecordExporter {}
  export type ReadableLogRecord = any;
  export type LogRecordExporter = any;
}

declare module '@opentelemetry/sdk-metrics' {
  export class MeterProvider {
    constructor(config?: any);
    addMetricReader(reader: any): void;
    shutdown(): Promise<void>;
    forceFlush(): Promise<void>;
  }
  export class PeriodicExportingMetricReader {
    constructor(config?: any);
  }
  export class ConsoleMetricExporter {}
  export const AggregationTemporality: any;
  export type PushMetricExporter = any;
  export type ResourceMetrics = any;
  export type MetricData = any;
  export type DataPoint = any;
}

declare module '@opentelemetry/sdk-trace-base' {
  export class BasicTracerProvider {
    constructor(config?: any);
    addSpanProcessor(processor: any): void;
    register(): void;
    shutdown(): Promise<void>;
    forceFlush(): Promise<void>;
  }
  export class SimpleSpanProcessor {
    constructor(exporter: any);
  }
  export class BatchSpanProcessor {
    constructor(exporter: any, config?: any);
  }
  export class ConsoleSpanExporter {}
}

// ---------------------------------------------------------------------------
// OpenTelemetry — Exporters (dynamically imported)
// ---------------------------------------------------------------------------
declare module '@opentelemetry/exporter-logs-otlp-grpc' {
  export class OTLPLogExporter { constructor(config?: any); }
}
declare module '@opentelemetry/exporter-logs-otlp-http' {
  export class OTLPLogExporter { constructor(config?: any); }
}
declare module '@opentelemetry/exporter-logs-otlp-proto' {
  export class OTLPLogExporter { constructor(config?: any); }
}
declare module '@opentelemetry/exporter-metrics-otlp-grpc' {
  export class OTLPMetricExporter { constructor(config?: any); }
}
declare module '@opentelemetry/exporter-metrics-otlp-http' {
  export class OTLPMetricExporter { constructor(config?: any); }
}
declare module '@opentelemetry/exporter-metrics-otlp-proto' {
  export class OTLPMetricExporter { constructor(config?: any); }
}
declare module '@opentelemetry/exporter-prometheus' {
  export class PrometheusExporter { constructor(config?: any); }
}
declare module '@opentelemetry/exporter-trace-otlp-grpc' {
  export class OTLPTraceExporter { constructor(config?: any); }
}
declare module '@opentelemetry/exporter-trace-otlp-http' {
  export class OTLPTraceExporter { constructor(config?: any); }
}
declare module '@opentelemetry/exporter-trace-otlp-proto' {
  export class OTLPTraceExporter { constructor(config?: any); }
}

// ---------------------------------------------------------------------------
// @ant/* — internal Anthropic packages (computer use, Chrome, etc.)
// ---------------------------------------------------------------------------
declare module '@ant/computer-use-mcp' {
  export function buildComputerUseTools(config?: any): any;
  export function createComputerUseMcpServer(config?: any): any;
  export function bindSessionContext(ctx: any): any;
  export const API_RESIZE_PARAMS: any;
  export function targetImageSize(width: number, height: number): any;
  export const DEFAULT_GRANT_FLAGS: any;
  export type ComputerExecutor = any;
  export type DisplayGeometry = any;
  export type FrontmostApp = any;
  export type InstalledApp = any;
  export type ResolvePrepareCaptureResult = any;
  export type RunningApp = any;
  export type ScreenshotResult = any;
  export type ComputerUseSessionContext = any;
  export type CuCallToolResult = any;
  export type CuPermissionRequest = any;
  export type CuPermissionResponse = any;
  export type ScreenshotDims = any;
}

declare module '@ant/computer-use-mcp/types' {
  export const DEFAULT_GRANT_FLAGS: any;
  export function getSentinelCategory(app: any): any;
  export type ComputerUseHostAdapter = any;
  export type Logger = any;
  export type CoordinateMode = any;
  export type CuSubGates = any;
  export type CuPermissionRequest = any;
  export type CuPermissionResponse = any;
}

declare module '@ant/computer-use-mcp/sentinelApps' {
  export function getSentinelCategory(app: any): any;
}

declare module '@ant/computer-use-input' {
  export type ComputerUseInput = any;
  export type ComputerUseInputAPI = any;
}

declare module '@ant/computer-use-swift' {
  export type ComputerUseAPI = any;
}

declare module '@ant/claude-for-chrome-mcp' {
  export const BROWSER_TOOLS: any[];
  export function createClaudeForChromeMcpServer(config?: any): any;
  export type ClaudeForChromeContext = any;
  export type Logger = any;
  export type PermissionMode = any;
}

// ---------------------------------------------------------------------------
// @anthropic-ai/* — Anthropic SDK packages
// ---------------------------------------------------------------------------
declare module '@anthropic-ai/mcpb' {
  export function parseManifest(data: any): any;
  export type McpbManifest = any;
  export type McpbUserConfigurationOption = any;
}

declare module '@anthropic-ai/sandbox-runtime' {
  export class SandboxManager {
    constructor(config?: any);
    [key: string]: any;
  }
  export const SandboxRuntimeConfigSchema: any;
  export class SandboxViolationStore {
    constructor();
    [key: string]: any;
  }
  export type FsReadRestrictionConfig = any;
  export type FsWriteRestrictionConfig = any;
  export type IgnoreViolationsConfig = any;
  export type NetworkHostPattern = any;
  export type NetworkRestrictionConfig = any;
  export type SandboxAskCallback = any;
  export type SandboxDependencyCheck = any;
  export type SandboxRuntimeConfig = any;
  export type SandboxViolationEvent = any;
}

declare module '@anthropic-ai/bedrock-sdk' {
  export class AnthropicBedrock {
    constructor(config?: any);
    [key: string]: any;
  }
}

declare module '@anthropic-ai/vertex-sdk' {
  export class AnthropicVertex {
    constructor(config?: any);
    [key: string]: any;
  }
}

declare module '@anthropic-ai/foundry-sdk' {
  export class AnthropicFoundry {
    constructor(config?: any);
    [key: string]: any;
  }
}

declare module '@anthropic-ai/claude-agent-sdk' {
  export type PermissionMode = any;
}

// ---------------------------------------------------------------------------
// AWS SDK
// ---------------------------------------------------------------------------
declare module '@aws-sdk/client-bedrock' {
  export class BedrockClient {
    constructor(config?: any);
    [key: string]: any;
  }
}

declare module '@aws-sdk/client-bedrock-runtime' {
  export class BedrockRuntimeClient {
    constructor(config?: any);
    [key: string]: any;
  }
  export type CountTokensCommandInput = any;
}

declare module '@aws-sdk/client-sts' {
  export class STSClient {
    constructor(config?: any);
    [key: string]: any;
  }
  export class GetCallerIdentityCommand {
    constructor(input?: any);
  }
}

declare module '@aws-sdk/credential-provider-node' {
  export function defaultProvider(config?: any): any;
}

declare module '@aws-sdk/credential-providers' {
  export function fromNodeProviderChain(config?: any): any;
  export function fromIni(config?: any): any;
}

// ---------------------------------------------------------------------------
// Azure
// ---------------------------------------------------------------------------
declare module '@azure/identity' {
  export class DefaultAzureCredential {
    constructor(config?: any);
    getToken(scope: string | string[]): Promise<any>;
  }
  export class ManagedIdentityCredential {
    constructor(config?: any);
  }
}

// ---------------------------------------------------------------------------
// Smithy (AWS internals)
// ---------------------------------------------------------------------------
declare module '@smithy/node-http-handler' {
  export class NodeHttpHandler {
    constructor(config?: any);
  }
}

declare module '@smithy/core' {
  export const middleware: any;
}

// ---------------------------------------------------------------------------
// Commander.js extra typings
// ---------------------------------------------------------------------------
declare module '@commander-js/extra-typings' {
  export class Command {
    constructor(name?: string);
    name(name: string): this;
    description(desc: string): this;
    version(ver: string): this;
    option(...args: any[]): this;
    argument(...args: any[]): this;
    action(fn: (...args: any[]) => any): this;
    command(name: string): Command;
    addCommand(cmd: Command): this;
    parse(argv?: string[]): this;
    opts(): any;
    [key: string]: any;
  }
  export class Option {
    constructor(flags: string, description?: string);
    default(value: any, description?: string): this;
    choices(values: readonly string[]): this;
    [key: string]: any;
  }
  export class InvalidArgumentError extends Error {
    constructor(message: string);
  }
}

// ---------------------------------------------------------------------------
// GrowthBook
// ---------------------------------------------------------------------------
declare module '@growthbook/growthbook' {
  export class GrowthBook {
    constructor(config?: any);
    loadFeatures(options?: any): Promise<void>;
    getFeatureValue(key: string, fallback?: any): any;
    isOn(key: string): boolean;
    setAttributes(attrs: any): void;
    destroy(): void;
    [key: string]: any;
  }
}

// ---------------------------------------------------------------------------
// QR Code
// ---------------------------------------------------------------------------
declare module 'qrcode' {
  export function toString(text: string, options?: any): Promise<string>;
  export function toDataURL(text: string, options?: any): Promise<string>;
  export function toBuffer(text: string, options?: any): Promise<Buffer>;
}

// ---------------------------------------------------------------------------
// Sharp (image processing)
// ---------------------------------------------------------------------------
declare module 'sharp' {
  interface Sharp {
    resize(width?: number, height?: number, options?: any): Sharp;
    toBuffer(): Promise<Buffer>;
    toFile(path: string): Promise<any>;
    metadata(): Promise<any>;
    png(options?: any): Sharp;
    jpeg(options?: any): Sharp;
    webp(options?: any): Sharp;
    [key: string]: any;
  }
  function sharp(input?: Buffer | string, options?: any): Sharp;
  export = sharp;
}

// ---------------------------------------------------------------------------
// Native / NAPI modules
// ---------------------------------------------------------------------------
declare module 'image-processor-napi' {
  const mod: any;
  export = mod;
}

declare module 'audio-capture-napi' {
  const mod: any;
  export = mod;
}

declare module 'url-handler-napi' {
  const mod: any;
  export = mod;
}

declare module 'color-diff-napi' {
  export class ColorDiff {
    constructor();
    [key: string]: any;
  }
  export class ColorFile {
    constructor();
    [key: string]: any;
  }
  export function getSyntaxTheme(): SyntaxTheme;
  export type SyntaxTheme = any;
}

// ---------------------------------------------------------------------------
// CLI highlight
// ---------------------------------------------------------------------------
declare module 'cli-highlight' {
  export function highlight(code: string, options?: any): string;
  export function supportsLanguage(lang: string): boolean;
}

// ---------------------------------------------------------------------------
// auto-bind
// ---------------------------------------------------------------------------
declare module 'auto-bind' {
  function autoBind<T extends object>(self: T, options?: any): T;
  export default autoBind;
}

// ---------------------------------------------------------------------------
// code-excerpt
// ---------------------------------------------------------------------------
declare module 'code-excerpt' {
  interface CodeExcerpt {
    line: number;
    value: string;
  }
  function codeExcerpt(source: string, line: number, options?: any): CodeExcerpt[];
  export default codeExcerpt;
  export type { CodeExcerpt };
}

// ---------------------------------------------------------------------------
// asciichart
// ---------------------------------------------------------------------------
declare module 'asciichart' {
  export function plot(series: number[] | number[][], config?: any): string;
  export const red: string;
  export const green: string;
  export const blue: string;
  export const yellow: string;
  export const cyan: string;
  export const magenta: string;
  export const white: string;
}

// ---------------------------------------------------------------------------
// cli-boxes
// ---------------------------------------------------------------------------
declare module 'cli-boxes' {
  interface BoxStyle {
    topLeft: string;
    topRight: string;
    bottomLeft: string;
    bottomRight: string;
    top: string;
    bottom: string;
    left: string;
    right: string;
  }
  interface Boxes {
    single: BoxStyle;
    double: BoxStyle;
    round: BoxStyle;
    bold: BoxStyle;
    singleDouble: BoxStyle;
    doubleSingle: BoxStyle;
    classic: BoxStyle;
    [key: string]: BoxStyle;
  }
  const boxes: Boxes;
  export default boxes;
  export type { Boxes, BoxStyle };
}

// ---------------------------------------------------------------------------
// @alcalzone/jsonl-db
// ---------------------------------------------------------------------------
declare module '@alcalzone/jsonl-db' {
  export class JsonlDB<V = any> {
    constructor(filename: string, options?: any);
    open(): Promise<void>;
    close(): Promise<void>;
    get(key: string): V | undefined;
    set(key: string, value: V): void;
    delete(key: string): boolean;
    has(key: string): boolean;
    clear(): void;
    [Symbol.iterator](): IterableIterator<[string, V]>;
    [key: string]: any;
  }
}

// ---------------------------------------------------------------------------
// cacache
// ---------------------------------------------------------------------------
declare module 'cacache' {
  export function get(cachePath: string, key: string, options?: any): Promise<any>;
  export function put(cachePath: string, key: string, data: any, options?: any): Promise<any>;
  export function rm(cachePath: string, key: string): Promise<any>;
  export function ls(cachePath: string): Promise<any>;
  const cacache: any;
  export default cacache;
}

// ---------------------------------------------------------------------------
// fflate
// ---------------------------------------------------------------------------
declare module 'fflate' {
  export function unzipSync(data: Uint8Array): Record<string, Uint8Array>;
  export function zipSync(data: Record<string, Uint8Array>): Uint8Array;
  export function deflateSync(data: Uint8Array): Uint8Array;
  export function inflateSync(data: Uint8Array): Uint8Array;
  export function gunzipSync(data: Uint8Array): Uint8Array;
  export function gzipSync(data: Uint8Array): Uint8Array;
  export function strToU8(str: string): Uint8Array;
  export function strFromU8(data: Uint8Array): string;
}

// ---------------------------------------------------------------------------
// plist
// ---------------------------------------------------------------------------
declare module 'plist' {
  export function parse(xml: string): any;
  export function build(obj: any): string;
}

// ---------------------------------------------------------------------------
// turndown (HTML to Markdown)
// ---------------------------------------------------------------------------
declare module 'turndown' {
  class TurndownService {
    constructor(options?: any);
    turndown(html: string): string;
    addRule(key: string, rule: any): this;
    use(plugin: any): this;
    [key: string]: any;
  }
  export = TurndownService;
}

// ---------------------------------------------------------------------------
// yaml
// ---------------------------------------------------------------------------
declare module 'yaml' {
  export function parse(str: string, options?: any): any;
  export function stringify(value: any, options?: any): string;
  export function parseDocument(str: string, options?: any): any;
  export class Document {
    constructor(value?: any, options?: any);
    [key: string]: any;
  }
}

// ---------------------------------------------------------------------------
// Markdown file imports (used by skill system)
// ---------------------------------------------------------------------------
declare module '*.md' {
  const content: string;
  export default content;
}

// ---------------------------------------------------------------------------
// Additional missing globals
// ---------------------------------------------------------------------------
declare function resolveAntModel(model: string): string;
declare function getAntModelOverrideConfig(): any;
declare function getAntModels(): any;
declare function fireCompanionObserver(event: string, data: any): void;
declare function computeTtftText(ttft: number): string;
declare function launchUltraplan(options: any): any;
declare const apiMetricsRef: any;
declare const HOOK_TIMING_DISPLAY_THRESHOLD_MS: number;

// Missing UI component stubs (referenced from mixed files)
declare const GateOverridesWarning: any;
declare const ExperimentEnrollmentNotice: any;
declare const UltraplanLaunchDialog: any;
declare const UltraplanChoiceDialog: any;
declare const TungstenPill: any;

// ---------------------------------------------------------------------------
// diff (jsdiff) — StructuredPatchHunk
// ---------------------------------------------------------------------------
declare module 'diff' {
  export type StructuredPatchHunk = any;
  export function structuredPatch(...args: any[]): any;
  export function createPatch(...args: any[]): string;
  export function createTwoFilesPatch(...args: any[]): string;
  export function applyPatch(...args: any[]): string | false;
  export function parsePatch(uniDiff: string): any[];
  export function diffLines(oldStr: string, newStr: string, options?: any): any[];
  export function diffChars(oldStr: string, newStr: string, options?: any): any[];
  export function diffWords(oldStr: string, newStr: string, options?: any): any[];
  export function diffWordsWithSpace(oldStr: string, newStr: string, options?: any): any[];
  export function diffArrays(oldArr: any[], newArr: any[], options?: any): any[];
}


interface ErrnoException extends Error {
  errno?: number;
  code?: string;
  path?: string;
  syscall?: string;
}

interface PromiseWithResolvers<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}
