import { exec } from 'child_process'
import fs from 'fs'
import path from 'path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { AgentAdapter } from './interface'
import { createOpenCodeAgentAdapter } from './opencode'

const execPromise = (cmd: string) => {
  return new Promise<void>((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

const pwd = process.cwd()
const tmpdir = path.join(pwd, '/.tmp/' + Date.now().toString())
fs.mkdirSync(tmpdir, { recursive: true })

describe('OpenCode Agent Adapter (SDK integration)', () => {
  let adapter: AgentAdapter

  beforeAll(async () => {
    // ensure port is free

    await execPromise(`lsof -ti:3780 | xargs kill -9 || echo "port free"`)

    adapter = await createOpenCodeAgentAdapter(3780, tmpdir)
  })

  afterAll(async () => {
    await adapter.stop()
  })

  test('should run a basic OpenCode agent flow', async () => {
    const sessionId = await adapter.startSession({})
    expect(sessionId).toBeDefined()
    const result = (await adapter.run(sessionId, 'What is the current working directory?'))!
    console.log(`Agent response: "${JSON.stringify(result)}"`)

    expect(result).toBeDefined()
    // adapter.run returns an object { text: string }
    expect(result.text).toBeDefined()
    expect(result.text).toContain(tmpdir)
  }, 120000)
})
