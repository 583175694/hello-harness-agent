import { createConnection } from 'node:net';
import type { Plugin } from 'vite';

const API_HOST = '127.0.0.1';
const API_PORT = Number.parseInt(process.env.API_PORT ?? '4318', 10);

function isApiPath(url: string): boolean {
  return url.startsWith('/api') || url === '/healthz' || url === '/readyz';
}

function probeApiReachable(timeoutMs = 250): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: API_HOST, port: API_PORT });
    const finish = (reachable: boolean) => {
      socket.removeAllListeners();
      if (!socket.destroyed) socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

/** API 未监听时直接 503，避免 Vite 内置 proxy 打出 ECONNREFUSED 日志。 */
export function apiProxyGuardPlugin(): Plugin {
  let lastProbeAt = 0;
  let lastReachable = false;

  async function apiReachable(): Promise<boolean> {
    const now = Date.now();
    if (now - lastProbeAt < 400) return lastReachable;
    lastProbeAt = now;
    lastReachable = await probeApiReachable();
    return lastReachable;
  }

  return {
    name: 'harness-api-proxy-guard',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        if (!isApiPath(url)) {
          next();
          return;
        }
        if (await apiReachable()) {
          next();
          return;
        }
        res.statusCode = 503;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(
          JSON.stringify({
            code: 'api_unavailable',
            detail: 'API 尚未就绪，请稍候再试。',
          }),
        );
      });
    },
  };
}
