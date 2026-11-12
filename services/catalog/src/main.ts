import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import { Catalog } from './application/catalog';
import { PostgresCatalog } from './adapters/postgres';
import { API_KEY, CatalogController, HealthController, ServiceGuard } from './adapters/http';
import { configuration } from './config';

async function main() {
  const config = configuration(process.env);
  const pool = new Pool({ connectionString: config.databaseUrl, max: 5,
    connectionTimeoutMillis: 5000, statement_timeout: 5000,
    options: '-c default_transaction_read_only=on',
  });
  @Module({
    controllers: [CatalogController, HealthController],
    providers: [ServiceGuard, { provide: API_KEY, useValue: config.apiKey },
      { provide: Catalog, useValue: new Catalog(new PostgresCatalog(pool)) },
      { provide: 'poolLifecycle', useValue: { onApplicationShutdown: () => pool.end() } }],
  })
  class CatalogModule {}
  const app = await NestFactory.create(CatalogModule, { logger: ['error', 'warn'] });
  app.enableShutdownHooks();
  await app.listen(config.port, '0.0.0.0');
}
void main().catch(() => { console.error('Catalog startup failed; check local configuration'); process.exitCode = 1; });
