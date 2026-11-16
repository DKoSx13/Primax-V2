import { PrivateCatalogController } from './private-catalog.controller';
import { FuelsService } from '../fuels/fuels.service';
import { StationsService } from '../stations/stations.service';
import { Actor } from '../auth/access';
describe('private inventory catalog', () => {
  const stations = [{id:'a'},{id:'b'}];
  const controller = new PrivateCatalogController({inventory:async()=>stations.map(r=>({stationId:r.id}))} as FuelsService,{list:async()=>stations} as StationsService);
  const actor: Extract<Actor,{kind:'control'}> = {kind:'control',userId:'u',role:'ENCARGADO',permissions:['ADMIN_CONTROL_ACCESS','ADMIN_INVENTORY_VIEW'],stationIds:['a'],global:false};
  it('scopes without a query and rejects foreign stations', async () => {
    expect(await controller.list(actor,{})).toEqual([stations[0]]);
    await expect(controller.inventory(actor,{stationId:'b'})).rejects.toThrow();
  });
  it('allows global administrators and rejects missing permissions', async () => {
    expect(await controller.list({...actor,global:true},{})).toEqual(stations);
    await expect(controller.list({...actor,permissions:[]},{})).rejects.toThrow();
  });
  it('does not treat members, kiosks or technical terminals as Control', async () => {
    for(const other of [{kind:'member',userId:'u'},{kind:'kiosk',stationId:'a'},{kind:'terminal',terminalId:'t',credentialId:'c',stationId:'a'}] as Actor[]) {
      await expect(controller.list(other,{})).rejects.toThrow();
    }
  });
});
