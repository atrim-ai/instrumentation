import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/schemas/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: 'target/dist',
  splitting: false,
  treeshake: true
})
