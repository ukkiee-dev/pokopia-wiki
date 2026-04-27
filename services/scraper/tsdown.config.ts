import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: false,
  // shared 패키지는 main 이 src/index.ts (TS) 라 production node 가 type stripping
  // 못 함 (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING). dist 에 inline 으로 bundle.
  noExternal: ['@pokopia-wiki/shared'],
  outputOptions: {
    entryFileNames: '[name].js',
  },
});
