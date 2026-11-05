import { IntersectionType, ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsByteLength,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ProfileDto, cleanText } from '../memberships/profile.dto';
import { EmailCredentialsDto } from './login.dto';

export const PRIME_PASSWORD_PATTERN = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;

export class RegisterDto extends IntersectionType(
  EmailCredentialsDto,
  ProfileDto,
) {
  @ApiProperty({ minLength: 1, maxLength: 80 })
  @Transform(({ value }: { value: unknown }) => cleanText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @ApiProperty({ minLength: 8, maxLength: 72 })
  @MinLength(8)
  @IsByteLength(0, 72)
  @Matches(PRIME_PASSWORD_PATTERN, {
    message: 'La contraseña requiere mayúscula, minúscula, número y carácter especial',
  })
  declare password: string;
}
