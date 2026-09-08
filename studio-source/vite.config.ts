import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'STUDIO_');
  return {
    base: './',
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    css: { postcss: { plugins: [tailwindcss()] } },
    build: { outDir: '../studio', emptyOutDir: true, sourcemap: false },
    server: { host: '127.0.0.1' },
    plugins: [
      react(),
      {
        name: 'local-private-plan',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use(
            '/__local_private_plan',
            async (req, res, next) => {
              if (!env.STUDIO_PRIVATE_PLAN) return next();
              const ip = req.socket.remoteAddress;
              if (
                !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip ?? '')
              ) {
                res.statusCode = 403;
                res.end();
                return;
              }
              try {
                const data = await readFile(env.STUDIO_PRIVATE_PLAN, 'utf8');
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Cache-Control', 'no-store');
                res.end(data);
              } catch {
                res.statusCode = 404;
                res.end('{}');
              }
            },
          );
        },
      },
    ],
  };
});
