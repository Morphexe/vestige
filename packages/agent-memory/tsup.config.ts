import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/supabase-adapter.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['@vestige/core', '@supabase/supabase-js'],
});
