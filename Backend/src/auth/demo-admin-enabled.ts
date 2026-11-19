import { ConfigService } from '@nestjs/config';

export function demoAdminEnabled(config: ConfigService) {
  return (
    config.get('APP_MODE') === 'local' &&
    config.get('SHOW_DEMO_ADMIN_CREDENTIALS') === 'true'
  );
}
