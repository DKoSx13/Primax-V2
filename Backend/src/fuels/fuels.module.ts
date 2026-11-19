import { Module } from '@nestjs/common';
import { FuelsController } from './fuels.controller';
import { FuelsService } from './fuels.service';
import { FuelsReadModule } from '../../services/catalog/src/bootstrap/fuels-read.module';
@Module({
  imports: [FuelsReadModule],
  exports: [FuelsService],
  controllers: [FuelsController],
  providers: [FuelsService],
})
export class FuelsModule {}
