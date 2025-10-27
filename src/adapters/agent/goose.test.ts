import fs from 'fs'
import path from 'path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createGooseAgentAdapter } from './goose'
import { AgentAdapter } from './interface'

describe('Goose Agent Adapter (SDK integration)', () => {
  let adapter: AgentAdapter
  let tmpdir: string

  beforeEach(async () => {
    const pwd = process.cwd()
    tmpdir = path.join(pwd, '/.tmp/' + Date.now().toString())
    fs.mkdirSync(tmpdir, { recursive: true })
    adapter = await createGooseAgentAdapter(tmpdir)
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

  /** @todo configuration issue with write access */
  test.skip('should be able to write files via the agent', async () => {
    const sessionId = await adapter.startSession({})
    expect(sessionId).toBeDefined()
    const filePath = path.join(tmpdir, 'agent-written-file.txt')
    const writeCommand = `Please create a file at path "${filePath}" with the content "Hello, OpenCode!" Don't ask for clarification, just do it.`

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
