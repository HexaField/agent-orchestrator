import type { AgentAdapter } from '../../types/adapters';

export function createCustom(): AgentAdapter {
  return {
    name: 'custom',
    async run(input) {
      // Behavior driven by prompt markers for tests
      const p = input.prompt.toLowerCase();
      if (p.includes('spec implemented')) {
        return { stdout: 'Spec implemented', stderr: '', exitCode: 0 };
      }
      if (p.includes('needs clarification')) {
        return { stdout: 'Needs Clarification', stderr: '', exitCode: 0 };
      }
      return { stdout: 'Completed Task', stderr: '', exitCode: 0 };
    },
  };
}
