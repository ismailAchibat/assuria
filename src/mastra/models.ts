// Local model served by Ollama through its OpenAI-compatible endpoint.
// Swap `modelId` (or add a second config) to compare small vs. larger models.

export const localModel = {
  providerId: 'ollama',
  modelId: process.env.LOCAL_MODEL ?? 'qwen3:8b',
  url: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1',
  apiKey: 'ollama', // ignored by Ollama, required by the client
};

// Qwen3 "thinking" is slow on a laptop GPU; disable it by default.
// Set LOCAL_MODEL_THINK=true to re-enable.
export const localModelOptions = {
  providerOptions: {
    ollama: { reasoningEffort: process.env.LOCAL_MODEL_THINK === 'true' ? 'medium' : 'none' },
  },
};
