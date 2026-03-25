import { IFDB_PROXY_PING_INTERVAL_MS } from './ifdb-client';

export interface IfdbProxyHeartbeatTimerApi {
  readonly setInterval: typeof globalThis.setInterval;
  readonly clearInterval: typeof globalThis.clearInterval;
}

export function startIfdbProxyHeartbeat(
  ping: () => Promise<void>,
  timerApi: IfdbProxyHeartbeatTimerApi = globalThis,
): () => void {
  const sendPing = () => {
    void ping().catch(() => {
      // Heartbeat failures should stay invisible to the user.
    });
  };

  sendPing();
  const intervalId = timerApi.setInterval(sendPing, IFDB_PROXY_PING_INTERVAL_MS);

  return () => {
    timerApi.clearInterval(intervalId);
  };
}
