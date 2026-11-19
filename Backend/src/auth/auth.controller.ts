import { composeIdentitySecurityOperations } from '../../services/identity/src/bootstrap/identity-security-operations.composition';
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from './access';
import { PasswordResetService } from './password-reset.service';
import {
  ForgotPasswordDto,
  VerifyResetCodeDto,
  ResetPasswordDto,
} from './password-reset.dto';
import { AuthService } from './auth.service';
import { LoginDto, LoginResponseDto } from './login.dto';
import { RegisterDto } from './register.dto';
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly boundary: ReturnType<typeof composeIdentitySecurityOperations>;
  constructor(
    private readonly service: AuthService,
    private readonly resetService: PasswordResetService,
  ) { this.boundary = composeIdentitySecurityOperations(this.service, this.resetService); }
  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  forgot(@Body() dto: ForgotPasswordDto) {
    return this.boundary.forgot(dto);
  }
  @Public()
  @Post('verify-reset-code')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  verify(@Body() dto: VerifyResetCodeDto) {
    return this.boundary.verify(dto);
  }
  @Public()
  @Post('reset-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  reset(@Body() dto: ResetPasswordDto) {
    return this.boundary.reset(dto);
  }
  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  register(@Body() dto: RegisterDto) {
    return this.boundary.register(dto);
  }
  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'Credenciales incorrectas' })
  login(@Body() dto: LoginDto) {
    return this.boundary.login(dto);
  }
}
