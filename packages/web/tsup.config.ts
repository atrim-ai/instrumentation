import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts'
  },
  format: ['esm'], // Browser only supports ESM
  dts: true,
  outDir: 'target/dist',
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  minify: false, // Don't minify during development
  target: 'es2020', // Modern browsers
  platform: 'browser',
  tsconfig: 'tsconfig.build.json',
  noExternal: ['@atrim/instrument-core'] // Bundle core code
})
