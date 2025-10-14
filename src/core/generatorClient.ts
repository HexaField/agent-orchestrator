import { getLLMAdapter } from '../adapters/llm'

export async function callLLM(provider: string, prompt: string) {
  const llm = getLLMAdapter(provider, { endpoint: process.env.LLM_ENDPOINT, model: process.env.LLM_MODEL })
  const out = await llm.generate({ prompt, temperature: 0 })
  return out.text || ''
}

export async function genContextLLM(provider: string, spec?: string) {
  const prompt = `You are a concise summarizer. Produce a 2-sentence context summary for the following spec:\n\n${spec || ''}`
  return callLLM(provider, prompt)
}

export async function genClarifyLLM(provider: string, spec?: string) {
  const prompt = `You are a helpful assistant. Given the following spec, list up to 5 targeted clarifying questions to resolve ambiguity:\n\n${spec || ''}`
  return callLLM(provider, prompt)
}

export async function genChangeLLM(provider: string, spec?: string, reason?: string) {
  const schema = {
    type: 'object',
    properties: {
      id: { type: 'string' },
      title: { type: 'string' },
      summary: { type: 'string' },
      acceptanceCriteria: { type: 'array', items: { type: 'string' } },
      effort: { type: 'string' }
    },
    required: ['title', 'summary']
  }

  const prompt = `You are an assistant that suggests exactly one actionable next task to address a review.\n\nSpec:\n${spec || ''}\n\nReason: ${reason || 'review'}\n\nReturn exactly one JSON object that matches this schema:\n${JSON.stringify(schema, null, 2)}\n\nOnly return the JSON object. If you cannot produce strict JSON, return a plain text description instead.`

  return callLLM(provider, prompt)
}
