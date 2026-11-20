import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { compare } from 'bcryptjs';
import { demoAdminEnabled } from './demo-admin-enabled';

const equal = (a: string, b: string) =>
  timingSafeEqual(
    createHash('sha256').update(a).digest(),
    createHash('sha256').update(b).digest(),
  );

/** Original administrative authentication engine extracted literally from AdminController. */
export class AdminAccessEngine {
  constructor(private readonly config: ConfigService, private readonly jwt: JwtService) {}
  demo() {
    if (!demoAdminEnabled(this.config)) return { enabled: false };
    return {
      enabled: true,
      username: this.config.get('DEMO_ADMIN_USER'),
      password: this.config.get('DEMO_ADMIN_PASSWORD'),
    };
  }
  async login(dto: { username: string; password: string }) {
    const demo = demoAdminEnabled(this.config);
    const username =
      this.config.get<string>(demo ? 'DEMO_ADMIN_USER' : 'ADMIN_USER') ?? '';
    const secret =
      this.config.get<string>(
        demo ? 'DEMO_ADMIN_PASSWORD' : 'ADMIN_PASSWORD_HASH',
      ) ?? '';
    const passwordValid =
      secret &&
      (demo
        ? equal(dto.password, secret)
        : await compare(dto.password, secret));
    if (!username || !equal(dto.username, username) || !passwordValid)
      throw new UnauthorizedException('Credenciales incorrectas');
    return {
      accessToken: await this.jwt.signAsync(
        { sub: 'admin', role: 'admin', adminUser: username },
        { expiresIn: '30m' },
      ),
    };
  }
}
