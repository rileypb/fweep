import { describe, expect, it, jest } from '@jest/globals';
import { IFDB_PROXY_PING_INTERVAL_MS } from '../../src/domain/ifdb-client';
import { startIfdbProxyHeartbeat } from '../../src/domain/ifdb-proxy-heartbeat';

describe('startIfdbProxyHeartbeat', () => {
  it('sends a ping immediately and then every 15 minutes', () => {
    const ping = jest.fn<() => Promise<void>>().mockResolvedValue();
    const setIntervalMock = jest.fn<typeof globalThis.setInterval>().mockReturnValue(123 as ReturnType<typeof setInterval>);
    const clearIntervalMock = jest.fn<typeof globalThis.clearInterval>();

    const stopHeartbeat = startIfdbProxyHeartbeat(ping, {
      setInterval: setIntervalMock,
      clearInterval: clearIntervalMock,
    });

    expect(ping).toHaveBeenCalledTimes(1);
    expect(setIntervalMock).toHaveBeenCalledTimes(1);
    expect(setIntervalMock.mock.calls[0]?.[1]).toBe(IFDB_PROXY_PING_INTERVAL_MS);

    const scheduledPing = setIntervalMock.mock.calls[0]?.[0];
    expect(typeof scheduledPing).toBe('function');

    (scheduledPing as () => void)();
    expect(ping).toHaveBeenCalledTimes(2);

    stopHeartbeat();
    expect(clearIntervalMock).toHaveBeenCalledWith(123);
  });

  it('silently swallows ping failures', async () => {
    const ping = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('Proxy unavailable'));
    const setIntervalMock = jest.fn<typeof globalThis.setInterval>().mockReturnValue(123 as ReturnType<typeof setInterval>);
    const clearIntervalMock = jest.fn<typeof globalThis.clearInterval>();

    startIfdbProxyHeartbeat(ping, {
      setInterval: setIntervalMock,
      clearInterval: clearIntervalMock,
    });

    await Promise.resolve();

    expect(ping).toHaveBeenCalledTimes(1);
  });
});
