import 'reflect-metadata';
import { MODULE_METADATA, GLOBAL_MODULE_METADATA } from '@nestjs/common/constants';
import { APP_GUARD } from '@nestjs/core';
import { AuthCoreModule } from './auth-core.module';
import { AuthCoreModule as CompatibilityCore, AuthModule } from './auth.module';
import { AuthController } from './auth.controller';
import { AdminController } from './admin.controller';
import { KioskController } from '../kiosk/kiosk.controller';
import { AuthService } from './auth.service';
import { KioskService } from '../kiosk/kiosk.service';
import { KioskStore } from '../kiosk/redis-store';
import { PasswordResetService } from './password-reset.service';
import { RecoveryDelivery } from './recovery-delivery';
import { AccessGuard } from './access.guard';
import { UsersModule } from '../users/users.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

describe('AuthCore composition boundary', () => {
  it('re-exports the same global core class without registering HTTP controllers', () => {
    expect(CompatibilityCore).toBe(AuthCoreModule);
    expect(Reflect.getMetadata(GLOBAL_MODULE_METADATA, AuthCoreModule)).toBe(true);
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AuthCoreModule) ?? []).toEqual([]);
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, AuthModule)).toEqual([AuthCoreModule]);
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, AuthModule)).toEqual([AuthCoreModule]);
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AuthModule)).toEqual([
      AuthController, AdminController, KioskController,
    ]);
  });

  it('retains the engines, global access guard, exports and JWT options', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AuthCoreModule)).toEqual([
      AuthService, KioskService, KioskStore, PasswordResetService, RecoveryDelivery,
      { provide: APP_GUARD, useClass: AccessGuard },
    ]);
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, AuthCoreModule)).toEqual([
      KioskService, KioskStore, AuthService, PasswordResetService, JwtModule,
    ]);
    const [users, jwt] = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AuthCoreModule);
    expect(users).toBe(UsersModule);
    expect(jwt.module).toBe(JwtModule);
    const options = jwt.providers.find((p: { useFactory?: unknown }) => p.useFactory);
    expect(options.inject).toEqual([ConfigService]);
    expect(options.useFactory(new ConfigService({ JWT_SECRET: 'synthetic-composition-secret' }))).toEqual({
      secret: 'synthetic-composition-secret',
      signOptions: { expiresIn: '1h', issuer: 'primax-v6', audience: 'primax-prime', algorithm: 'HS256' },
      verifyOptions: { issuer: 'primax-v6', audience: 'primax-prime', algorithms: ['HS256'] },
    });
  });
});
