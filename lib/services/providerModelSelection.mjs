export const TASK_MODEL_PRIORITIES = {
  chat: [['puter', 'gpt-4o'], ['puter', 'claude-sonnet-4-5'], ['gemini', 'gemini-1.5-pro'], ['groq', 'llama-3.3-70b-versatile'], ['puter', 'gpt-4o-mini']],
  vision: [['puter', 'gpt-4o'], ['gemini', 'gemini-1.5-pro'], ['openrouter', 'google/gemini-2.0-flash']],
  code: [['deepseek', 'deepseek-coder'], ['puter', 'gpt-4o'], ['groq', 'llama-3.3-70b-versatile']],
  creative: [['puter', 'claude-sonnet-4-5'], ['puter', 'gpt-4o'], ['gemini', 'gemini-1.5-pro'], ['openrouter', 'anthropic/claude-3.5-sonnet']],
  analysis: [['puter', 'claude-opus-4'], ['puter', 'gpt-4o'], ['gemini', 'gemini-1.5-pro'], ['openrouter', 'anthropic/claude-3.5-sonnet']],
  fast: [['groq', 'llama-3.3-70b-versatile'], ['puter', 'gpt-4o-mini'], ['ollama', 'ollama/mistral']],
};

export function pickRecommendedModel(taskType, providers) {
  const healthyProviders = providers.filter((provider) => provider.status === 'healthy' && provider.apiKeyConfigured);

  if (healthyProviders.length === 0) return null;

  const priorities = TASK_MODEL_PRIORITIES[taskType] || TASK_MODEL_PRIORITIES.chat;

  for (const [providerId, modelId] of priorities) {
    const provider = healthyProviders.find((entry) => entry.id === providerId);
    if (!provider) continue;

    const model = provider.models.find((entry) => entry.id === modelId);
    if (model && !model.deprecated) {
      return { providerId, modelId };
    }
  }

  const fallback = healthyProviders[0];
  return { providerId: fallback.id, modelId: fallback.models[0].id };
}
