import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { proxyIfdbRequest } from './src/domain/ifdb-proxy';

function createIfdbProxyPlugin(): Plugin {
  const handleIfdbProxyRequest: Connect.NextHandleFunction = async (request, response, next) => {
    const requestUrl = request.url ?? '';
    if (!requestUrl.startsWith('/api/ifdb/')) {
      next();
      return;
    }

    if (request.method !== 'GET') {
      response.statusCode = 405;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({ error: 'Method not allowed.' }));
      return;
    }

    try {
      const proxyResult = await proxyIfdbRequest(new URL(requestUrl, 'http://localhost'));
      response.statusCode = proxyResult.status;
      response.setHeader('content-type', proxyResult.contentType);
      response.end(proxyResult.body);
    } catch (error) {
      response.statusCode = 502;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({
        error: error instanceof Error ? error.message : 'IFDB proxy request failed.',
      }));
    }
  };

  return {
    name: 'fweep-ifdb-proxy',
    configureServer(server) {
      server.middlewares.use(handleIfdbProxyRequest);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleIfdbProxyRequest);
    },
  };
}

export const viteConfig = defineConfig({
  plugins: [react(), createIfdbProxyPlugin()],
  base: '/',
});

export default viteConfig;
