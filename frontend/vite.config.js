import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3050,
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
        timeout: 60000,
        proxyTimeout: 60000,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, res) => {
            console.warn('[vite proxy error]:', err.message);
            if (res && !res.headersSent && typeof res.writeHead === 'function') {
              try {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Proxy connection issue. Retrying...' }));
              } catch (e) {}
            }
          });
        }
      }
    }
  }
})
