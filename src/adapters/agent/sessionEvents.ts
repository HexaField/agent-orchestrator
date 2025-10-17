/**
 * Small helpers for normalizing session events and matching common prompts
 * used by PTY adapters.
 */

export function isClarifyingQuestion(text: string): boolean {
  if (!text) return false
  const t = text.trim()
  // common heuristics: ends with a question mark and is not a simple prompt
  if (t.endsWith('?')) return true
  // explicit keywords
  if (/what should i name|what file|how should/i.test(t)) return true
  return false
}

export function matchSandboxPrompt(text: string): boolean {
  if (!text) return false
  const t = text.toLowerCase()
  // common phrasing variants observed in codex wrapper
  if (t.includes('you are running codex in') && t.includes('allow codex to work')) return true
  if (t.includes('1. yes') && t.includes('2. no')) return true
  if (t.includes('press enter to continue') || t.includes('press any key')) return true
  return false
}

export async function respondAutoApprove(respond: (s: string) => Promise<void>) {
  try {
    // default behavior: send Enter to advance prompts
    await respond('\n')
  } catch {}
}

export default { isClarifyingQuestion, matchSandboxPrompt, respondAutoApprove }
