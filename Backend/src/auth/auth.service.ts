import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { createHash } from 'node:crypto';
import { UsersService } from '../users/users.service';
import { LoginDto } from './login.dto';
import { RegisterDto } from './register.dto';
@Injectable()
export class AuthService {
  private readonly dummyHash = hash('invalid-account-timing-placeholder', 12);
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}
  async login(dto: LoginDto) {
    if (dto.email && dto.identifier)
      throw new BadRequestException('Usa un solo identificador');
    const identifier = (dto.identifier ?? dto.email ?? '').trim().toLowerCase();
    const user = /^\d{8}$/.test(identifier)
      ? await this.users.findByDni(identifier)
      : await this.users.findByEmail(identifier);
    const valid = await compare(
      dto.password,
      user?.passwordHash ?? (await this.dummyHash),
    );
    if (!user?.active || !valid)
      throw new UnauthorizedException('Correo, DNI o contraseña incorrectos');
    return this.session(user);
  }
  async register(dto: RegisterDto, nonce?: string) {
    let id: string | undefined;
    if (nonce !== undefined && process.env.APP_MODE === 'local') {
      if (!/^[0-9a-f]{64}$/.test(nonce))
        throw new BadRequestException('Identificador de registro inválido');
      // The fair proxy can recognize the committed account even if it lost the response.
      const key = createHash('sha256')
        .update(`prime-fair-registration:${nonce}:${dto.email}`)
        .digest('hex');
      id = `${key.slice(0, 8)}-${key.slice(8, 12)}-8${key.slice(13, 16)}-8${key.slice(17, 20)}-${key.slice(20, 32)}`;
    }
    const passwordHash = await hash(dto.password, 12);
    const user = id
      ? await this.users.register(dto, passwordHash, id)
      : await this.users.register(dto, passwordHash);
    return this.session(user);
  }
  private async session(user: {
    id: string;
    name: string;
    email: string;
    authVersion?: number;
  }) {
    return {
      accessToken: await this.jwt.signAsync({
        sub: user.id,
        ver: user.authVersion ?? 0,
      }),
      tokenType: 'Bearer',
      expiresIn: 3600,
      user: { id: user.id, name: user.name, email: user.email },
    };
  }
}
