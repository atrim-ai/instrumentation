import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'instrumentation-schema': 'src/instrumentation-schema.ts',
    logger: 'src/logger.ts'
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  target: 'es2020',
  outDir: 'target/dist',
  tsconfig: 'tsconfig.build.json'
})
