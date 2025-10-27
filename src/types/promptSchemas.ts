/**
 * Registry of prompt schemas for templates under .agent/templates
 */

export const promptSchemas: Record<string, object> = {
  // sample template: .agent/templates/spec.md
  'spec.md': {
    $id: 'https://hexafield.dev/schemas/prompt/spec.json',
    type: 'object',
    additionalProperties: false,
    required: ['title', 'specPath'],
    properties: {
      title: { type: 'string' },
      specPath: { type: 'string' },
      checklist: { type: 'array', items: { type: 'string' }, nullable: true },
    },
  },
}

export function getSchemaForTemplate(name: string): object | undefined {
  return promptSchemas[name]
}

export default promptSchemas
