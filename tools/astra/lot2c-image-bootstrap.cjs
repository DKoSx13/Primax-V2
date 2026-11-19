// Runs inside each production image with networking disabled. Nest creation is
// intercepted before any lifecycle hook, database connection or socket opens.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const requireApp = createRequire('/app/package.json');
requireApp('reflect-metadata');
const { NestFactory } = requireApp('@nestjs/core');
const { ConfigService } = requireApp('@nestjs/config');
const domain = process.argv[2];
Object.assign(process.env, {
  APP_MODE: 'local', DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:5432/synthetic',
  JWT_SECRET: 'synthetic-bootstrap-secret'.repeat(3), KIOSK_API_KEY: 'synthetic-bootstrap-kiosk'.repeat(3),
});
const root = domain === 'legacy' ? '/app/dist' : `/app/services/${domain}/dist`;
const { AuthCoreModule } = require(root + '/src/auth/auth-core.module.js');
const config = new ConfigService({ APP_MODE: 'production', CORS_ORIGINS: 'https://synthetic.invalid', PORT: 3999 });
const calls = [];
let application;
const app = {
  get: token => { assert.equal(token, ConfigService); return config; },
  use: () => {}, setGlobalPrefix: prefix => assert.equal(prefix, 'api/v1'),
  useGlobalPipes: () => {}, useGlobalFilters: () => {}, enableCors: () => {},
  enableShutdownHooks: () => {}, listen: async (...args) => { calls.push(args); },
};
NestFactory.create = async module => { application = module; return app; };
if (domain !== 'legacy') {
  const manifest = JSON.parse(fs.readFileSync(root + '/build-manifest.json'));
  assert.equal(manifest.service, domain);
  assert.equal(manifest.entrypoint, `src/apps/${domain}/main.js`);
  const files = Object.keys(manifest.files);
  assert.equal(files.filter(p => /src\/apps\/[^/]+\/main\.js$/.test(p)).length, 1);
  if (domain !== 'identity') {
    assert(!files.some(p => /services\/identity\//.test(p)));
    assert(!files.includes('src/auth/auth.module.js'));
  }
}
require(root + (domain === 'legacy' ? '/src/main.js' : `/src/apps/${domain}/main.js`));
setImmediate(() => {
  assert(application, 'Entrypoint did not compose Nest application');
  assert.equal(calls.length, 1, 'Entrypoint did not reach listen exactly once');
  const imports = Reflect.getMetadata('imports', application);
  if (domain !== 'legacy') {
    assert.equal(imports.filter(m => m === AuthCoreModule).length, 1);
    assert.equal(imports.some(m => m.name === 'AuthModule'), domain === 'identity');
    assert.deepEqual(calls[0], [3999, '0.0.0.0']);
  }
  console.log(JSON.stringify({ domain, bootstrapReachedListen: true, realNestLifecycle: false, network: 'none', databaseCommands: 0 }));
});
