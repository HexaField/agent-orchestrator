import type { LLMAdapter } from '../../types/adapters';

export function createPassthrough(): LLMAdapter {
  return {
    name: 'passthrough',
    async generate(input) {
      return { text: input.prompt };
    },
  };
}
