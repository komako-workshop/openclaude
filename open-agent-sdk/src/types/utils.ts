/**
 * Utility types used across the codebase.
 * Restored from import analysis.
 */

/**
 * Recursively makes all properties of T readonly (deep immutable).
 */
export type DeepImmutable<T> = T extends (infer U)[]
  ? ReadonlyArray<DeepImmutable<U>>
  : T extends Map<infer K, infer V>
    ? ReadonlyMap<DeepImmutable<K>, DeepImmutable<V>>
    : T extends Set<infer U>
      ? ReadonlySet<DeepImmutable<U>>
      : T extends object
        ? { readonly [K in keyof T]: DeepImmutable<T[K]> }
        : T

/**
 * Generates all permutations of a union type as a tuple.
 * Used by messageQueueManager for exhaustive operation type checks.
 */
export type Permutations<T extends string, U extends string = T> = [T] extends [never]
  ? []
  : T extends T
    ? [T, ...Permutations<Exclude<U, T>>]
    : never
