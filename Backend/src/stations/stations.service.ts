import { Injectable } from '@nestjs/common';
import { StationsReadAdapter } from '../../services/catalog/src/adapters/inbound/stations-read.adapter';
@Injectable()
export class StationsService {
  constructor(private readonly stationsRead: StationsReadAdapter) {}
  list() {
    return this.stationsRead.list();
  }
}
