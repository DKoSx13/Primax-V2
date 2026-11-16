import "reflect-metadata";
import { Body, Controller, Post, Req, ValidationPipe } from "@nestjs/common";
import { ApiBody } from "@nestjs/swagger";
import { Request } from "express";
import { KioskController } from "../compatibility/kiosk/kiosk.controller";
import { KioskService } from "../compatibility/kiosk/kiosk.service";
import { Public } from "../compatibility/auth/access";
import { OperationalSessionCoordinator } from "./coordinator";

const BootstrapDto = Reflect.getMetadata(
  "design:paramtypes",
  KioskController.prototype,
  "terminalBootstrap",
)[1];

@Public()
@Controller("kiosk/session")
export class OperationalKioskController extends KioskController {
  constructor(
    kiosk: KioskService,
    private readonly coordinator: OperationalSessionCoordinator,
  ) {
    super(kiosk);
  }
  @Post("terminal-bootstrap")
  @ApiBody({ type: BootstrapDto })
  override terminalBootstrap(
    @Req() req: Request,
    @Body(
      new ValidationPipe({
        expectedType: BootstrapDto,
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    body: { terminalId?: string; terminalCode?: string },
  ) {
    return this.coordinator.bootstrap(req, body.terminalId, body.terminalCode);
  }
}
