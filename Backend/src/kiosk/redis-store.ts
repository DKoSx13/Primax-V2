import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

/** Shared Redis state. Never falls back to process memory. */
@Injectable()
export class KioskStore implements OnModuleDestroy {
  private readonly localRedis?: RedisClientType;
  private connecting?: Promise<void>;
  private nextConnectAt = 0;
  private stopping = false;

  constructor(private readonly config: ConfigService) {
    const url = config.get<string>('KIOSK_REDIS_URL');
    if (config.get<string>('APP_MODE') === 'local' && url) {
      this.localRedis = createClient({
        url,
        disableOfflineQueue: true,
        socket: {
          connectTimeout: 4000,
          reconnectStrategy: (retries) => {
            if (this.stopping || retries > 3) {
              this.nextConnectAt = Date.now() + 1000;
              return new Error('Redis local unavailable');
            }
            return Math.min(retries * 250, 750);
          },
        },
      });
      // Do not log Redis URLs, arguments, credentials or key material.
      this.localRedis.on('error', () => undefined);
    }
  }

  async onModuleDestroy() {
    this.stopping = true;
    if (!this.localRedis || !this.localRedis.isOpen) return;
    try {
      if (this.localRedis.isReady) await this.localRedis.close();
      else this.localRedis.destroy();
    } catch {
      // A socket may already have closed while Nest is shutting down.
      try {
        this.localRedis.destroy();
      } catch {
        /* already closed */
      }
    }
  }

  private async connectLocalRedis() {
    if (this.stopping) throw new Error('Store stopping');
    if (!this.localRedis || this.localRedis.isReady) return;
    if (!this.connecting) {
      // An open, unready socket belongs to node-redis's bounded reconnect loop.
      // Never start a second loop or queue/replay commands while it recovers.
      if (this.localRedis.isOpen || Date.now() < this.nextConnectAt)
        throw new Error('Redis unavailable');
      const client = this.localRedis;
      this.connecting = Promise.resolve()
        .then(() => {
          if (this.stopping) throw new Error('Store stopping');
          return client.connect();
        })
        .then(() => undefined)
        .catch((error: unknown) => {
          this.nextConnectAt = Date.now() + 1000;
          throw error;
        })
        .finally(() => {
          // A settled promise must never suppress future connection attempts.
          this.connecting = undefined;
        });
    }
    await this.connecting;
  }

  async command<T>(...command: (string | number)[]): Promise<T> {
    if (this.stopping)
      throw new ServiceUnavailableException(
        'Autenticación temporalmente no disponible',
      );
    if (this.localRedis) {
      try {
        await this.connectLocalRedis();
        if (this.stopping || !this.localRedis.isReady)
          throw new Error('Redis unavailable');
        return (await this.localRedis.sendCommand(command.map(String))) as T;
      } catch {
        throw new ServiceUnavailableException(
          'Autenticación temporalmente no disponible',
        );
      }
    }
    try {
      const response = await fetch(
        this.config.getOrThrow<string>('KIOSK_REDIS_REST_URL'),
        {
          method: 'POST',
          redirect: 'error',
          headers: {
            Authorization: `Bearer ${this.config.getOrThrow<string>('KIOSK_REDIS_REST_TOKEN')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(command),
          signal: AbortSignal.timeout(4000),
        },
      );
      if (!response.ok) throw Error();
      const value = (await response.json()) as { result: T; error?: string };
      if (value.error || !Object.hasOwn(value, 'result')) throw Error();
      return value.result;
    } catch {
      throw new ServiceUnavailableException(
        'Autenticación temporalmente no disponible',
      );
    }
  }
  key(suffix: string) {
    return `primax:v12:${this.config.getOrThrow<string>('KIOSK_SESSION_NAMESPACE')}:${suffix}`;
  }
  async limit(scope: string, count: number, seconds: number) {
    const total = await this.command<number>(
      'EVAL',
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
      1,
      this.key(`limit:${scope}`),
      seconds,
    );
    if (!Number.isInteger(total) || total < 1)
      throw new ServiceUnavailableException(
        'Autenticación temporalmente no disponible',
      );
    return total <= count;
  }
}
