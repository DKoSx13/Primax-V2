import { Module } from '@nestjs/common';
import { AuthCoreModule } from './auth-core.module';
import { AuthController } from './auth.controller';
import { AdminController } from './admin.controller';
import { KioskController } from '../kiosk/kiosk.controller';

// Preserve source compatibility while core consumers use the controller-free module.
export { AuthCoreModule } from './auth-core.module';

@Module({
  imports: [AuthCoreModule],
  controllers: [AuthController, AdminController, KioskController],
  exports: [AuthCoreModule],
})
export class AuthModule {}
