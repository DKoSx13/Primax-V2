import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsEnum,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { PaymentMethod, PurchaseMode, ReceiptType } from '@prisma/client';
import { PlateDto } from '../vehicles/plate.dto';
import { V2_PAYMENT_METHODS } from '../payments/payments.service';

export class CapturedContinuationDto {
  @IsUUID() orderId: string;
  @IsUUID() paymentId: string;
  @IsString() @Matches(/^\d{1,6}(\.\d{1,2})?$/) amount: string;
  @IsIn(['PEN']) currency: 'PEN';
}

/**
 * Solicitud de reserva de saldo, previa al abastecimiento postpago.
 *
 * En esta fase no se sirve combustible: el backend solo comprueba identidad,
 * saldo y referencias, y descuenta el importe autorizado del saldo Prime para
 * que quede comprometido mientras la manguera dispensa.
 */
export class CreateAuthorizationDto extends PlateDto {
  @ApiPropertyOptional({ type: CapturedContinuationDto })
  @IsOptional() @IsObject() @ValidateNested() @Type(() => CapturedContinuationDto)
  capturedContinuation?: CapturedContinuationDto;
  @IsOptional() @IsEnum(PurchaseMode) mode?: PurchaseMode;
  @IsOptional() @IsIn(V2_PAYMENT_METHODS) paymentMethod?: PaymentMethod;
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,6}(\.\d{1,2})?$/)
  unitPrice?: string;
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allowDebt?: boolean;
  @ApiProperty({
    format: 'uuid',
    description: 'UUID estable por autorización. Reutilízalo al reintentar.',
  })
  @IsUUID('4')
  operationId: string;

  @ApiProperty({
    example: '200.00',
    description:
      'Importe a reservar del saldo, en soles. Debe cubrir el consumo previsto.',
  })
  @IsString()
  @Matches(/^\d{1,6}(\.\d{1,2})?$/)
  amount: string;

  @ApiProperty({
    description: 'Código de membresía Prime capturado en el terminal.',
    example: 'PRIME-001',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9-]{4,30}$/)
  membershipCode?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  stationId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  fuelId: string;

  @ApiPropertyOptional({ enum: ReceiptType, default: 'BOLETA' })
  @IsEnum(ReceiptType)
  receiptType: ReceiptType = ReceiptType.BOLETA;
}
