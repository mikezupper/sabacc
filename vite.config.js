import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        allowedHosts: ['localhost','.pages.dev','.open-pool.com','.video-miner.xyz'],
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    react: ['react', 'react-dom'],
                    lucide: ['lucide-react']
                },
            },
        },
    }
})
