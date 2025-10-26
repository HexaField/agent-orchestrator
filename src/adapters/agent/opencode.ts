import { createOpencodeClient } from '@opencode-ai/sdk'
import { spawn } from 'child_process'

export async function createOpenCodeAgentAdapter(port: number, projectPath: string) {
  // I can't figure out how to start open-code server in a specific path, so
  // we will use the CLI to start the server in the desired directory.
  const process = spawn(`cd ${projectPath} && opencode serve --port ${port}`, {
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })

  process.on('close', (code) => {
    if (code !== 0) {
      throw new Error(`Command failed with exit code ${code}`)
    }
  })

  // wait for server to output that it's ready
  const readyString = `opencode server listening on http://127.0.0.1:${port}`

  await new Promise<void>((resolve) => {
    process.stdout.on('data', (data) => {
      console.log(data.toString())
      if (data.toString().includes(readyString)) {
        resolve()
      }
    })
  })

  const client = await createOpencodeClient({
    baseUrl: `http://localhost:${port}`
  })

  return {
    startSession: async () => {
      const session = await client.session.create({
        body: { title: 'My session' }
      })
      const project = await client.project.current()

      if (session.error) {
        const message = (session.error.data as any)?.message || 'Unknown error'
        throw new Error('Failed to create session' + message)
      }

      return session.data.id
    },
    run: async (session: string, input: string) => {
      const result = await client.session.prompt({
        path: { id: session },
        body: {
          model: { providerID: 'github-copilot', modelID: 'gpt-5-mini' },
          parts: [{ type: 'text', text: input }]
        }
      })

      if (result.error) {
        const message = (result.error.data as any)?.message || 'Unknown error'
        throw new Error('Failed to run prompt' + message)
      }
      return result.data.parts.find((part) => part.type === 'text')?.text
    },
    stop: async () => {
      process.kill(0)
    }
  }
}
