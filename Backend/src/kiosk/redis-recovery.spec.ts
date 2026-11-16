import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import { KioskStore } from './redis-store';

jest.mock('redis', () => ({ createClient: jest.fn() }));

describe('local Redis connection lifecycle', () => {
  const client = {
    isOpen: false,
    isReady: false,
    on: jest.fn(),
    connect: jest.fn(),
    sendCommand: jest.fn(),
    close: jest.fn(),
    destroy: jest.fn(),
  };
  let store: KioskStore;
  const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(10000);
    jest.clearAllMocks();
    client.isOpen = false;
    client.isReady = false;
    (createClient as jest.Mock).mockReturnValue(client);
    client.connect.mockImplementation(async () => {
      client.isOpen = true;
      client.isReady = true;
    });
    client.sendCommand.mockResolvedValue('fixture');
    client.close.mockImplementation(async () => {
      client.isOpen = false;
      client.isReady = false;
    });
    client.destroy.mockImplementation(() => {
      client.isOpen = false;
      client.isReady = false;
    });
    store = new KioskStore(
      new ConfigService({
        APP_MODE: 'local',
        KIOSK_REDIS_URL: 'redis://synthetic-only',
      }),
    );
  });
  afterEach(() => jest.useRealTimers());
  it('shares one initial connection across concurrent callers', async () => {
    await Promise.all(
      Array.from({ length: 50 }, () => store.command('GET', 'fixture')),
    );
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.sendCommand).toHaveBeenCalledTimes(50);
  });
  it('reconnects after a successful connection later exhausts native retries', async () => {
    await store.command('GET', 'fixture');
    client.isReady = false;
    client.isOpen = false;
    await Promise.all(
      Array.from({ length: 50 }, () => store.command('GET', 'fixture')),
    );
    expect(client.connect).toHaveBeenCalledTimes(2);
  });
  it('leaves an open reconnecting socket to the driver and fails fast', async () => {
    client.isOpen = true;
    await expect(store.command('GET', 'fixture')).rejects.toMatchObject({
      status: 503,
    });
    expect(client.connect).not.toHaveBeenCalled();
    expect(client.sendCommand).not.toHaveBeenCalled();
  });
  it('bounds failed connection rounds by cooldown, including concurrent bursts', async () => {
    client.connect.mockRejectedValue(new Error('offline'));
    const attempt = () =>
      store.command('GET', 'fixture').catch((e) => e.status);
    expect(await Promise.all(Array.from({ length: 50 }, attempt))).toEqual(
      Array(50).fill(503),
    );
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(await attempt()).toBe(503);
    expect(client.connect).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1000);
    client.connect.mockImplementation(async () => {
      client.isOpen = true;
      client.isReady = true;
    });
    await Promise.all(
      Array.from({ length: 50 }, () => store.command('GET', 'fixture')),
    );
    expect(client.connect).toHaveBeenCalledTimes(2);
  });
  it('applies cooldown when background driver reconnection exhausts its budget', async () => {
    await store.command('GET', 'fixture');
    client.isReady = false;
    client.isOpen = false;
    const options = (createClient as jest.Mock).mock.calls[0][0];
    expect(options.disableOfflineQueue).toBe(true);
    expect(options.socket.reconnectStrategy(4)).toBeInstanceOf(Error);
    await expect(store.command('GET', 'fixture')).rejects.toMatchObject({
      status: 503,
    });
    expect(client.connect).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1000);
    await store.command('GET', 'fixture');
    expect(client.connect).toHaveBeenCalledTimes(2);
  });
  it('never replays a command whose result was lost', async () => {
    let applied = 0;
    client.sendCommand.mockImplementation(async () => {
      applied++;
      throw Error('reply lost');
    });
    await expect(store.command('INCR', 'fixture')).rejects.toMatchObject({
      status: 503,
    });
    expect(applied).toBe(1);
    expect(client.sendCommand).toHaveBeenCalledTimes(1);
  });
  it('shutdown prevents future connections and commands', async () => {
    await store.command('GET', 'fixture');
    await store.onModuleDestroy();
    await expect(store.command('GET', 'fixture')).rejects.toMatchObject({
      status: 503,
    });
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.close).toHaveBeenCalledTimes(1);
  });
  it('shutdown during connect cannot send a command after the promise settles', async () => {
    let finish!: () => void;
    client.connect.mockImplementation(() => {
      client.isOpen = true;
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    const result = store.command('GET', 'fixture').catch((e) => e.status);
    await flush();
    await store.onModuleDestroy();
    finish();
    expect(await result).toBe(503);
    expect(client.destroy).toHaveBeenCalledTimes(1);
    expect(client.sendCommand).not.toHaveBeenCalled();
  });
});
