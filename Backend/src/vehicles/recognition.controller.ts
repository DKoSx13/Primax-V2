import { composePlateRecognition } from '../../services/identity/src/bootstrap/plate-recognition.composition';
import { Body, Controller, Post } from '@nestjs/common';
import { ApiProperty, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn, MaxLength, MinLength } from 'class-validator';
import { KioskOnly } from '../auth/access';
import { RecognitionService } from './recognition.service';
class ImageDto {
  @IsOptional() @IsIn(['plate','membership']) kind?: 'plate'|'membership';
  @ApiProperty({
    description: 'Imagen JPEG/PNG base64, sin prefijo data:, máximo 2 MB',
  })
  @IsString()
  @MinLength(16)
  @MaxLength(2800000)
  image: string;
}
@ApiTags('plate-recognition')
@ApiSecurity('kiosk')
@KioskOnly()
@Controller('plate-recognition')
export class RecognitionController {
  private readonly boundary: ReturnType<typeof composePlateRecognition>;
  constructor(private readonly service: RecognitionService) { this.boundary = composePlateRecognition(this.service); }
  @Post() recognize(@Body() dto: ImageDto) {
    return this.boundary.recognize(dto.image, dto.kind);
  }
}
