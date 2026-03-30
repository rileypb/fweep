import { describe, expect, it, jest } from '@jest/globals';
import { IFDB_PROXY_PING_INTERVAL_MS } from '../../src/domain/ifdb-client';
import { startIfdbProxyHeartbeat } from '../../src/domain/ifdb-proxy-heartbeat';

describe('startIfdbProxyHeartbeat', () => {
  it('sends a ping immediately and then every 15 minutes', () => {
    const ping = jest.fn<() => Promise<void>>().mockResolvedValue();
    const intervalId = 123 as unknown as ReturnType<typeof setInterval>;
    const scheduledIntervals: Array<{ handler: TimerHandler; timeout: number | undefined }> = [];
    const clearedIntervals: Array<Parameters<typeof globalThis.clearInterval>[0]> = [];
    const setIntervalMock = ((
      handler: TimerHandler,
      timeout?: number,
    ) => {
      scheduledIntervals.push({ handler, timeout });
      return intervalId;
    }) as unknown as typeof globalThis.setInterval;
    const clearIntervalMock: typeof globalThis.clearInterval = (nextIntervalId) => {
      clearedIntervals.push(nextIntervalId);
    };

    const stopHeartbeat = startIfdbProxyHeartbeat(ping, {
      setInterval: setIntervalMock,
      clearInterval: clearIntervalMock,
    });

    expect(ping).toHaveBeenCalledTimes(1);
    expect(scheduledIntervals).toHaveLength(1);
    expect(scheduledIntervals[0]?.timeout).toBe(IFDB_PROXY_PING_INTERVAL_MS);

    const scheduledPing = scheduledIntervals[0]?.handler;
    expect(typeof scheduledPing).toBe('function');

    (scheduledPing as () => void)();
    expect(ping).toHaveBeenCalledTimes(2);

    stopHeartbeat();
    expect(clearedIntervals).toEqual([intervalId]);
  });

  it('silently swallows ping failures', async () => {
    const ping = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('Proxy unavailable'));
    const setIntervalMock = (() => 123 as unknown as ReturnType<typeof setInterval>) as unknown as typeof globalThis.setInterval;
    const clearIntervalMock: typeof globalThis.clearInterval = () => undefined;

    startIfdbProxyHeartbeat(ping, {
      setInterval: setIntervalMock,
      clearInterval: clearIntervalMock,
    });

    await Promise.resolve();

    expect(ping).toHaveBeenCalledTimes(1);
  });
});
