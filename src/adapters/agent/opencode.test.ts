import fs from 'fs'
import path from 'path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { AgentAdapter } from './interface'
import { createOpenCodeAgentAdapter } from './opencode'

describe('OpenCode Agent Adapter (SDK integration)', () => {
  let adapter: AgentAdapter
  let tmpdir: string

  beforeEach(async () => {
    const pwd = process.cwd()
    tmpdir = path.join(pwd, '/.tmp/' + Date.now().toString())
    fs.mkdirSync(tmpdir, { recursive: true })

    // pick a free port for this test run to avoid collisions when tests run in parallel
    const getFreePort = (): Promise<number> =>
      new Promise((resolve, reject) => {
        const net = require('net')
        const s = net.createServer()
        s.unref()
        s.on('error', reject)
        s.listen(0, () => {
          const port = (s.address() as any).port
          s.close(() => resolve(port))
        })
      })

    const port = await getFreePort()
    adapter = await createOpenCodeAgentAdapter(port, tmpdir)
  })

  afterEach(async () => {
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

  test('should be able to write files via the agent', async () => {
    const sessionId = await adapter.startSession({})
    expect(sessionId).toBeDefined()
    const filePath = path.join(tmpdir, 'agent-written-file.txt')
    const writeCommand = `Please create a file at path "${filePath}" with the content "Hello, OpenCode!"`

    const writeResult = await adapter.run(sessionId, writeCommand)
    console.log(`Agent write response: "${JSON.stringify(writeResult)}"`)

    expect(writeResult).toBeDefined()
    expect(writeResult.text).toBeDefined()
    expect(writeResult.text.toLowerCase()).toContain('created')

    // verify the file was actually created with the expected content
    const fileContent = fs.readFileSync(filePath, 'utf-8')
    expect(fileContent).toBe('Hello, OpenCode!')
  }, 150000)
})
