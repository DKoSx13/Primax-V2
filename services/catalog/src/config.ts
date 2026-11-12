export function configuration(env: NodeJS.ProcessEnv) {
  const environment = env.APP_ENV;
  if (!['dev', 'qa', 'staging', 'production'].includes(environment || '')) throw Error('APP_ENV required');
  const databaseUrl = env.CATALOG_DATABASE_URL;
  if (!databaseUrl || !['postgres:', 'postgresql:'].includes(new URL(databaseUrl).protocol)) throw Error('Catalog PostgreSQL URL required');
  const apiKey = env.CATALOG_API_KEY;
  if (!apiKey || apiKey.length < 32) throw Error('CATALOG_API_KEY must have at least 32 characters');
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid port');
  return { environment, databaseUrl, apiKey, port };
}
