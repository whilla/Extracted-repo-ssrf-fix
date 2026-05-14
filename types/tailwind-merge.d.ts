// Type declarations for tailwind-merge
declare module 'tailwind-merge' {
  export function twMerge(...classLists: (string | undefined | null | false)[]): string;
  export function extend<T extends Record<string, string>>(config: T): (classList: string) => string;
  export function twJoin(...classLists: (string | undefined | null | false)[]): string;
  export function twJoin<T extends Record<string, string>>(config: T, ...classLists: (string | undefined | null | false)[]): string;
}
