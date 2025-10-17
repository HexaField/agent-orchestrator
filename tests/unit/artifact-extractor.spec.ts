import fs from 'fs'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createArtifactExtractor } from '../../src/adapters/agent/artifactExtractor'

const TMP = path.join(process.cwd(), 'tests', '.agent', 'runs')

function cleanup() {
  try {
    if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true })
  } catch {}
}

describe('artifact extractor', () => {
  beforeEach(() => cleanup())
  afterEach(() => cleanup())

  it('writes a unified patches file and detects git-style patches', () => {
    const sessionId = 'test-session-1'
    const extractor = createArtifactExtractor(sessionId, process.cwd())
    // simulate NDJSON objects with aggregated_output and raw diff
    extractor.process({ aggregated_output: 'Some summary' })
    extractor.process(
      'diff --git a/foo b/foo\nindex 000..111\n--- a/foo\n+++ b/foo\n@@ -1 +1 @@\n-hello\n+hello world\n'
    )
    extractor.finalize()

    const pth = path.join(process.cwd(), '.agent', 'runs', `${sessionId}.patches.diff`)
    expect(fs.existsSync(pth)).toBeTruthy()
    const content = fs.readFileSync(pth, 'utf8')
    expect(content).toContain('Some summary')
    expect(content).toContain('diff --git')
    const patchPath = path.join(process.cwd(), '.agent', 'runs', `${sessionId}.codex-generated.patch`)
    expect(fs.existsSync(patchPath)).toBeTruthy()
  })

  it('extracts marker-style files and fenced code File headers', () => {
    const sessionId = 'test-session-2'
    const extractor = createArtifactExtractor(sessionId, process.cwd())
    const marker = '=== src/hello.txt ===\nHello world\n'
    const fence = '```ts\n// File: src/ok.ts\nexport const ok = 1\n```\n'
    extractor.process(marker)
    extractor.process(fence)
    extractor.finalize()

    const markerFile = path.join(process.cwd(), 'src', 'hello.txt')
    expect(fs.existsSync(markerFile)).toBeTruthy()
    expect(fs.readFileSync(markerFile, 'utf8')).toContain('Hello world')

    const fenceFile = path.join(process.cwd(), 'src', 'ok.ts')
    expect(fs.existsSync(fenceFile)).toBeTruthy()
    expect(fs.readFileSync(fenceFile, 'utf8')).toContain('export const ok')
  })
})
