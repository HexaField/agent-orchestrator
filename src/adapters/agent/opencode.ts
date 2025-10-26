import { createOpencodeClient } from '@opencode-ai/sdk'
import { ChildProcess, spawn } from 'child_process'
import { AgentAdapter } from './interface'

export async function createOpenCodeAgentAdapter(port: number, projectPath: string): Promise<AgentAdapter> {
  // I can't figure out how to start open-code server in a specific path, so
  // we will use the CLI to start the server in the desired directory.
  const serverProcess: ChildProcess = spawn(`cd ${projectPath} && opencode serve --port ${port}`, {
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })

  // detach so the child runs in its own process group; this allows killing the group later
  try {
    serverProcess.unref?.()
  } catch (e) {
    // ignore if unref not available
  }

  serverProcess.on('close', (code) => {
    if (code !== 0) {
      console.error(`opencode process exited with code ${code}`)
    }
  })

  // wait for server to output that it's ready
  const readyString = `opencode server listening on http://127.0.0.1:${port}`

  await new Promise<void>((resolve, reject) => {
    const onData = (data: any) => {
      const s = data.toString()
      console.log(s)
      if (s.includes(readyString)) {
        cleanup()
        resolve()
      }
    }

    const onError = (err: any) => {
      cleanup()
      reject(err)
    }

    function cleanup() {
      serverProcess.stdout?.off('data', onData)
      serverProcess.stderr?.off('data', onError)
    }

    serverProcess.stdout?.on('data', onData)
    serverProcess.stderr?.on('data', onError)
  })

  const client = await createOpencodeClient({
    baseUrl: `http://localhost:${port}`
  })

  return {
    startSession: async (_options) => {
      const session = await client.session.create({
        body: { title: 'My session' }
      })

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
      return { text: result.data.parts.find((part) => part.type === 'text')?.text! }
    },
    stop: async () => {
      return new Promise<void>((resolve) => {
        try {
          // kill the whole process group to ensure underlying server is terminated
          if (serverProcess.pid) {
            try {
              process.kill(-serverProcess.pid, 'SIGTERM')
            } catch (err) {
              // fallback to killing the direct child
              serverProcess.kill('SIGTERM')
            }
          } else {
            serverProcess.kill('SIGTERM')
          }
        } catch (err) {
          // ignore
        }
        // wait for close event or timeout
        const to = setTimeout(() => resolve(), 3000)
        serverProcess.once('close', () => {
          clearTimeout(to)
          resolve()
        })
      })
    }
  }
}
