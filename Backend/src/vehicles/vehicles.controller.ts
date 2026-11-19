import { composeVehicleLinking } from '../../services/identity/src/bootstrap/vehicle-linking.composition';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CreateVehicleDto } from './create-vehicle.dto';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { VehicleResponseDto } from '../common/response.dto';
import { Actor, CurrentActor, MemberOrKiosk } from '../auth/access';
import { PaginationDto } from '../common/pagination.dto';
import { PlateDto } from './plate.dto';
import { VehiclesService } from './vehicles.service';
@ApiTags('vehicles')
@ApiBearerAuth()
@Controller('vehicles')
export class VehiclesController {
  private readonly boundary: ReturnType<typeof composeVehicleLinking>;
  constructor(private readonly service: VehiclesService) { this.boundary = composeVehicleLinking(this.service); }
  @Post()
  create(@Body() dto: CreateVehicleDto, @CurrentActor() actor: Actor) {
    return this.boundary.create(dto, actor);
  }
  @Get() @ApiOkResponse({ type: [VehicleResponseDto] }) list(
    @CurrentActor() actor: Actor,
    @Query() query: PaginationDto,
  ) {
    return this.service.list(actor, query);
  }
  @Get(':plate')
  @MemberOrKiosk()
  @ApiSecurity('kiosk')
  @ApiOkResponse({ type: VehicleResponseDto })
  find(@Param() params: PlateDto, @CurrentActor() actor: Actor) {
    return this.service.findByPlate(params.plate, actor);
  }
}
