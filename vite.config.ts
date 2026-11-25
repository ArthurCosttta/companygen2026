import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
// @ts-expect-error — o serviço HTTP é um módulo Node ESM.
import { createWorkspaceApi } from './server/workspace.mjs';

function workspaceApi(): Plugin {
  const api = createWorkspaceApi();
  return {
    name: 'companygen-workspace-api',
    configureServer(server) {
      server.middlewares.use(api.handler);
      server.httpServer?.once('close', api.close);
    },
    configurePreviewServer(server) {
      server.middlewares.use(api.handler);
      server.httpServer?.once('close', api.close);
    },
  };
}

export default defineConfig(({ mode }) => {
  for (const [name, value] of Object.entries(loadEnv(mode, process.cwd(), ['CG_', 'VITE_SUPABASE_', 'SUPABASE_SERVICE_ROLE_KEY', 'GLM_', 'RUNPOD_', 'AI_', 'IMAGE_', 'ALLOW_LOCAL_']))) {
    process.env[name] ??= value;
  }
  return {
    base: './',
    plugins: [react(), tailwindcss(), workspaceApi()],
    resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
    server: {
      port: 5173,
      fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.companygen/**', '**/sessao_whatsapp/**', '**/studio.json'] },
    },
    preview: { port: 4173 },
    build: {
      chunkSizeWarningLimit: 650,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react-dom/') || id.includes('node_modules/react/')) {
              return 'vendor-react';
            }
            if (id.includes('node_modules/lucide-react/')) {
              return 'vendor-icons';
            }
            if (id.includes('node_modules/@phosphor-icons/')) {
              return 'vendor-phosphor';
            }
            if (id.includes('node_modules/zod/')) {
              return 'vendor-zod';
            }
            if (id.includes('node_modules/motion/') || id.includes('node_modules/framer-motion/')) {
              return 'vendor-motion';
            }
            if (id.includes('node_modules/@supabase/')) {
              return 'vendor-supabase';
            }
            if (id.includes('node_modules/jszip/')) {
              return 'vendor-zip';
            }
          },
        },
      },
    },
  };
});
