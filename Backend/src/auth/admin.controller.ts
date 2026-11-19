import { composeAdminIdentityWorkflows } from '../../services/identity/src/bootstrap/admin-identity-workflows.composition';
import { demoAdminEnabled } from './demo-admin-enabled';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { createHash, timingSafeEqual } from 'node:crypto';
import { compare } from 'bcryptjs';
import { Throttle } from '@nestjs/throttler';
import { KioskOnly, Public } from './access';
import { PlateDto } from '../vehicles/plate.dto';
import { AlertsService } from '../alerts/alerts.service';

class AdminLoginDto {
  @IsString() @MaxLength(80) username: string;
  @IsString() @MaxLength(200) password: string;
}
class CheckPlateDto extends PlateDto {
  @IsString() @Matches(/^[A-Z0-9-]{4,30}$/) membershipCode: string;
  @IsUUID('4') operationId: string;
}
export { demoAdminEnabled } from './demo-admin-enabled';
const equal = (a: string, b: string) =>
  timingSafeEqual(
    createHash('sha256').update(a).digest(),
    createHash('sha256').update(b).digest(),
  );

@Controller('admin')
export class AdminController {
  private readonly boundary: ReturnType<typeof composeAdminIdentityWorkflows>;
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly alerts: AlertsService,
  ) { this.boundary = composeAdminIdentityWorkflows(this.alerts); }
  @Get('demo-credentials')
  @Public()
  demo() {
    if (!demoAdminEnabled(this.config)) return { enabled: false };
    return {
      enabled: true,
      username: this.config.get('DEMO_ADMIN_USER'),
      password: this.config.get('DEMO_ADMIN_PASSWORD'),
    };
  }
  @Post('login')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(@Body() dto: AdminLoginDto) {
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
  @Get('alerts')
  @SetMetadata('access', 'admin')
  list() {
    return this.boundary.list();
  }
  @Get('dashboard')
  @SetMetadata('access', 'admin')
  dashboard() {
    return this.boundary.dashboard();
  }
  @Post('alerts/:id/resolve')
  @SetMetadata('access', 'admin')
  resolve(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.boundary.resolve(
      id,
      this.config.get<string>(
        demoAdminEnabled(this.config) ? 'DEMO_ADMIN_USER' : 'ADMIN_USER',
      ) ?? 'admin',
    );
  }
  @Post('check-plate')
  @KioskOnly()
  check(@Body() dto: CheckPlateDto) {
    return this.boundary.checkPlate(
      dto.plate,
      dto.membershipCode,
      dto.operationId,
    );
  }
}
