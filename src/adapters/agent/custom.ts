import type { AgentAdapter } from '../../types/adapters'

export function createCustom(): AgentAdapter {
  return {
    name: 'custom',
    async run(input) {
      // Behavior driven by prompt markers for tests
      const p = String(input.prompt)
      const low = p.toLowerCase()
      if (low.includes('patch:')) {
        const idx = low.indexOf('patch:')
        // return the original text after the marker
        return { stdout: p.slice(idx + 6).trim(), stderr: '', exitCode: 0 }
      }
      if (low.includes('spec implemented')) {
        return { stdout: 'Spec implemented', stderr: '', exitCode: 0 }
      }
      if (low.includes('needs clarification')) {
        return { stdout: 'Needs Clarification', stderr: '', exitCode: 0 }
      }
      return { stdout: 'Completed Task', stderr: '', exitCode: 0 }
    }
  }
}
