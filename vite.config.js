import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  let env = loadEnv(mode, process.cwd())
  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src',
          import.meta.url)),
      },
    },
    //代理跨域
    server: {
      proxy: {
        [env.VITE_APP_BASE_API]: {
          //获取数据的服务器地址设置
          target: env.VITE_SERVE,
          //需要代理跨域
          changeOrigin: true,
          //路径重写
          // rewrite: (path) => (path.replace(/^\/api/, '')+'/api/'),
        },
      },
    },
    // 使用publicPath而不是base
    base: '/TSEditor/',
    publicPath: '/TSEditor/',
    
    build: {
      // 添加构建选项，使输出更可靠
      outDir: 'dist',
      assetsDir: 'assets',
      emptyOutDir: true,
      sourcemap: false,
      // 明确设置重写路径策略
      rollupOptions: {
        output: {
          manualChunks: undefined
        }
      }
    }
  }
})
