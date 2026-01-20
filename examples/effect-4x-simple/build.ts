import * as esbuild from 'esbuild'
import effectPlugin from '@clayroach/effect-unplugin/esbuild'

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/index.js',
  sourcemap: true,
  plugins: [
    effectPlugin({
      sourceTrace: true,
      spans: { enabled: true } // Enable auto-spans for source location
    })
  ],
  external: ['effect']
})

console.log('Build complete!')
