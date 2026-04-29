export type RoutedProvider =
  | 'puter'
  | 'openrouter'
  | 'githubmodels'
  | 'poe'
  | 'bytez'
  | 'groq'
  | 'gemini'
  | 'deepseek'
  | 'nvidia'
  | 'together'
  | 'fireworks'
  | 'ollama';

export function buildFallbackProviders(
  preferredProvider: RoutedProvider,
  configuredProviders: RoutedProvider[],
  options: { disablePuterFallback?: boolean } = {}
): RoutedProvider[] {
  const { disablePuterFallback = false } = options;
  const orderedProviders = [
    preferredProvider,
    ...configuredProviders.filter((provider) => provider !== preferredProvider),
  ];

  if (preferredProvider === 'puter') {
    return Array.from(new Set(orderedProviders));
  }

  if (!disablePuterFallback) {
    return Array.from(new Set(orderedProviders));
  }

  const nonPuterProviders = orderedProviders.filter((provider) => provider !== 'puter');
  return Array.from(new Set(nonPuterProviders.length > 0 ? nonPuterProviders : [preferredProvider]));
}
