

export interface HookAmplificationResult {
  hook: string;
  rationale: string;
}

export function amplifyHook(source: string): HookAmplificationResult {
  const firstLine = source.split('\n').map((line) => line.trim()).filter(Boolean)[0] || source.trim();
  const normalized = firstLine.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return {
      hook: 'Watch this carefully. Something is wrong from frame one.',
      rationale: 'Fallback hook forces immediate curiosity in the first three seconds.',
    };
  }

  const hasTension = /\b(why|how|never|no one|wrong|secret|before|after|until)\b/i.test(normalized);
  if (hasTension) {
    return {
      hook: normalized,
      rationale: 'Existing hook already contains curiosity/tension triggers.',
    };
  }

  return {
    hook: `This starts normal for one second, then everything breaks: ${normalized}`,
    rationale: 'Injected pattern interrupt to increase first-3-second retention.',
  };
}
