import { ApiProperty, PickType } from '@nestjs/swagger';
import { IsByteLength, IsString, Matches, MinLength } from 'class-validator';
import { EmailCredentialsDto } from './login.dto';
export class ForgotPasswordDto extends PickType(EmailCredentialsDto, [
  'email',
] as const) {}
export class VerifyResetCodeDto extends ForgotPasswordDto {
  @ApiProperty() @IsString() @Matches(/^\d{8}$/) code: string;
}
export class ResetPasswordDto {
  @ApiProperty({ minLength: 8, maxLength: 72 })
  @IsString() @MinLength(8) @IsByteLength(0, 72) password: string;
  @ApiProperty() @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) resetToken: string;
}
