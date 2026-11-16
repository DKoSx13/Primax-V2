import { scopeCatalog } from '../catalog-reader/catalog-reader';
import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { FuelResponseDto } from '../common/response.dto';
import { Actor, CurrentActor, Public } from '../auth/access';
import { FuelsService } from './fuels.service';
@ApiTags('fuels')
@Controller('fuels')
export class FuelsController {
  constructor(private readonly service: FuelsService) {}
  @Header('Cache-Control', 'no-store')
  @Public() @Get('inventory') async inventory(@CurrentActor() actor?: Actor) {
    const rows = await this.service.inventory();
    return scopeCatalog(rows, actor, row => row.stationId);
  }
  @Public() @Get() @ApiOkResponse({ type: [FuelResponseDto] }) list() {
    return this.service.list();
  }
}
