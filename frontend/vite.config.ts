import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { handleIfdbProxyHttpRequest } from '../shared/ifdb-proxy-http';

function createIfdbProxyPlugin(): Plugin {
  const handleIfdbProxyRequest: Connect.NextHandleFunction = async (request, response, next) => {
    const requestUrl = request.url ?? '';
    if (!requestUrl.startsWith('/api/ifdb/')) {
      next();
      return;
    }

    try {
      const proxyResult = await handleIfdbProxyHttpRequest({
        method: request.method ?? 'GET',
        url: requestUrl,
      });
      response.statusCode = proxyResult.status;
      for (const [headerName, headerValue] of Object.entries(proxyResult.headers)) {
        response.setHeader(headerName, headerValue);
      }
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
