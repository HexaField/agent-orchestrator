import { build } from 'esbuild'
import fg from 'fast-glob'

// Find all .ts files under src except tests
const entries = await fg(['src/**/*.ts', '!src/**/*.test.ts'])

await build({
  entryPoints: entries,
  bundle: false,
  outdir: 'dist',
  platform: 'node',
  format: 'esm',
  sourcemap: true,
  target: ['node18'],
  external: [],
  logLevel: 'info',
  outbase: 'src'
})

console.log('esbuild: build complete')
