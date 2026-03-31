// Augment Anthropic SDK with types that may exist in newer versions
import '@anthropic-ai/sdk/resources/beta/messages/messages.mjs';

declare module '@anthropic-ai/sdk/resources/beta/messages/messages.mjs' {
  export type BetaJSONOutputFormat = any;
  export type BetaOutputConfig = any;
  export type BetaRequestDocumentBlock = any;
  export type BetaMessageStreamParams = any;
}
