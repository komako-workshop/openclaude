// Augment React types for React 19+ APIs used in this codebase
// This file uses `import` to make it a module, which enables proper augmentation
// rather than ambient module override.
import 'react';

declare module 'react' {
  export function use<T>(promise: PromiseLike<T>): T;
  export function use<T>(context: React.Context<T>): T;
  export function useEffectEvent<T extends (...args: any[]) => any>(fn: T): T;
}
