import fs from 'fs/promises'
import path from 'path'
import Ajv from 'ajv'
import { getSchemaForTemplate } from '../types/promptSchemas'

const AJV = new Ajv({ allErrors: true, strict: false })

const TEMPLATES_DIR = path.join(process.cwd(), '.agent', 'templates')

function renderTemplate(template: string, inputs: Record<string, any>) {
  // replace <%varName%> with inputs[varName]
  return template.replace(/<%\s*([a-zA-Z0-9_.-]+)\s*%>/g, (_, key) => {
    const val = inputs[key]
    if (val === undefined) throw new Error(`Missing template input: ${key}`)
    // simple stringification for arrays/objects
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return String(val)
    try {
      return JSON.stringify(val)
    } catch {
      return String(val)
    }
  })
}

export async function loadTemplate(templateName: string): Promise<string> {
  const p = path.join(TEMPLATES_DIR, templateName)
  const content = await fs.readFile(p, 'utf8')
  return content
}

export async function compilePrompt(templateName: string, inputs: Record<string, any>) {
  const schema = getSchemaForTemplate(templateName)
  if (!schema) throw new Error(`No schema registered for template: ${templateName}`)
  const validate = AJV.compile(schema as any)
  const valid = validate(inputs)
  if (!valid) {
    const errs = JSON.stringify(validate.errors)
    throw new Error(`Prompt inputs validation failed: ${errs}`)
  }
  const tpl = await loadTemplate(templateName)
  const compiled = renderTemplate(tpl, inputs)
  // For now we return compiled string as `user` and empty system
  return { system: '', user: compiled, schema }
}

export default { loadTemplate, compilePrompt }
