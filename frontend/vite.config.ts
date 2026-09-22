import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import path from 'path'

// @ts-ignore
import { copyLegalDocs } from './scripts/copy-legal-docs.mjs'

function legalDocsPlugin() {
  return {
    name: 'legal-docs-sync',
    buildStart() {
      copyLegalDocs()
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  esbuild: {
    // @ts-ignore
    keepNames: true
  },
  build: {
    rollupOptions: {
      // @ts-ignore - Rolldown specific option to disable plugin timings warning
      checks: {
        pluginTimings: false
      }
    }
  },
  plugins: [
    legalDocsPlugin(),
    react(),
    babel({
      include: /\.[tj]sx?$/,
      exclude: /node_modules/,
      presets: [reactCompilerPreset()]
    })
  ],
  resolve: {
    alias: {
      // Prevents the duplicate React context error in memory
      'react': path.resolve(__dirname, './node_modules/react'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
    },
  },
})