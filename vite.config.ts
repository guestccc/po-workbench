import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Vite 配置：同时承载开发服务器、构建与 Vitest 测试环境
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // 使用 @ 指向 src，避免深层目录中出现大量相对路径
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    open: false,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: false,
  },
  build: {
    // antd 单 chunk 约 1.1MB（gzip 后约 350KB），属于该依赖正常体积，放宽告警阈值
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // 将体积较大的第三方依赖拆分为独立 chunk，改善首屏缓存命中
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          antd: ['antd', '@ant-design/icons'],
        },
      },
    },
  },
})
