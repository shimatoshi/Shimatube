import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['ios >= 12', 'safari >= 12'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime']
    })
  ],
  // ↓↓↓ ここが追加・変更ポイント ↓↓↓
  esbuild: {
    // 開発サーバー(npm run dev)でも古い書き方に変換させる
    target: 'es2015', 
  },
  build: {
    // 本番ビルド時のターゲット
    target: ['es2015', 'ios12'],
  },
  // ↑↑↑ ここまで ↑↑↑
  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})

