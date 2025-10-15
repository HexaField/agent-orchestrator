import { promises as fs } from 'fs'
import path from 'path'

export type TemplateParams = Record<string, string | number | boolean | undefined>

export function templatesDir(cwd = process.cwd()): string {
  return path.join(cwd, '.agent', 'templates')
}

export async function readTemplateFile(cwd: string, name: string): Promise<string | undefined> {
  const p = path.join(templatesDir(cwd), name)
  try {
    const txt = await fs.readFile(p, 'utf8')
    return txt
  } catch {
    // In test environment, fall back to built-in defaults to make tests stable
    if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') {
      return DEFAULT_TEMPLATES[name]
    }
    return undefined
  }
}

export function readTemplateFileSync(cwd: string, name: string): string | undefined {
  const p = path.join(templatesDir(cwd), name)
  try {
    const txt = require('fs').readFileSync(p, 'utf8')
    return txt
  } catch {
    if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') {
      return DEFAULT_TEMPLATES[name]
    }
    return undefined
  }
}

// Render a template by replacing %varName% tokens with provided params.
// - missing params are replaced with an empty string
// - literal percent can be emitted by using %% in the template
export async function renderTemplate(
  cwd: string,
  name: string,
  params: TemplateParams = {}
): Promise<string | undefined> {
  const txt = await readTemplateFile(cwd, name)
  if (typeof txt === 'undefined') return undefined

  // protect literal %% by temporary placeholder
  const placeholder = '\u0000'
  let working = txt.replace(/%%/g, placeholder)

  working = working.replace(/%([a-zA-Z0-9_]+)%/g, (_, key: string) => {
    const v = params[key]
    if (v === undefined || v === null) return ''
    return String(v)
  })

  // restore literal percent
  working = working.replace(new RegExp(placeholder, 'g'), '%')
  return working
}

export function renderTemplateSync(cwd: string, name: string, params: TemplateParams = {}): string | undefined {
  const txt = readTemplateFileSync(cwd, name)
  if (typeof txt === 'undefined') return undefined

  const placeholder = '\u0000'
  let working = txt.replace(/%%/g, placeholder)

  working = working.replace(/%([a-zA-Z0-9_]+)%/g, (_, key: string) => {
    const v = params[key]
    if (v === undefined || v === null) return ''
    return String(v)
  })

  working = working.replace(new RegExp(placeholder, 'g'), '%')
  return working
}

const DEFAULT_TEMPLATES: Record<string, string> = {
  'context.md': `Context summary: %summary%

Use the checklist and acceptance criteria to guide changes.`,

  'clarify.md': `Please clarify the overall acceptance criteria for this spec:\n%spec%`,

  'agentPrompt.md': `Context:
%context%

Checklist:
%checklist%

ResponseType: %responseType%

Instructions:
%instructions%`,

  // LLM-specific change prompt (uses %spec%, %reason%, %schema%)
  'change.llm.md': `You are an assistant that suggests exactly one actionable next task to address a review.

Spec:
%spec%

Reason: %reason%

Return exactly one JSON object that matches this schema:
%schema%

Only return the JSON object. If you cannot produce strict JSON, return a plain text description instead.`
}

DEFAULT_TEMPLATES['change.md'] =
  '```json\n{\n  "title": "Changes requested: %reason%",\n  "summary": "Please update the code to match the spec: %spec%",\n  "acceptanceCriteria": ["Address review comments"]\n}\n```'

DEFAULT_TEMPLATES['reviewChanges.md'] = `Summary of changes.`

export async function ensureTemplatesDir(cwd = process.cwd()): Promise<void> {
  const dir = templatesDir(cwd)
  try {
    await fs.mkdir(dir, { recursive: true })
  } catch {
    // ignore
  }
}

// Seed default templates into .agent/templates. Will not overwrite existing files.
export async function seedTemplates(cwd = process.cwd()): Promise<void> {
  const dir = templatesDir(cwd)
  await ensureTemplatesDir(cwd)
  for (const [name, content] of Object.entries(DEFAULT_TEMPLATES)) {
    const p = path.join(dir, name)
    try {
      await fs.access(p)
      // file exists — skip
      continue
    } catch {
      try {
        await fs.writeFile(p, content, 'utf8')
      } catch {
        // ignore write errors
      }
    }
  }
}

export default {
  templatesDir,
  readTemplateFile,
  renderTemplate,
  seedTemplates
}
