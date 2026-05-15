declare module 'tailwind-merge' {
  export function twJoin(...classLists: (string | undefined | null | false)[]): string;
  export function twMerge(...classLists: (string | undefined | null | false)[]): string;
  export type Config = Record<string, unknown>;
  export function extendTailwindMerge(config: Partial<Config>): typeof twMerge;
  export function createTailwindMerge(...config: unknown[]): typeof twMerge;
  export type ClassGroup = readonly string[];
  export type ThemeObject = Record<string, ClassGroup>;
}
