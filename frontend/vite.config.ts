import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  build: {
    rollupOptions: {
      // @ts-ignore - Rolldown specific option to disable plugin timings warning
      checks: {
        pluginTimings: false
      }
    }
  },
  plugins: [
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