import { scopeCatalog, CatalogReader } from './catalog-reader';
import { ConfigService } from '@nestjs/config';
describe('Catalog facade', () => {
  const rows = [{id:'a'}, {id:'b'}];
  it('preserves unscoped public and member results', () => {
    expect(scopeCatalog(rows, undefined, r => r.id)).toEqual(rows);
    expect(scopeCatalog(rows, {kind:'member',userId:'u'}, r => r.id)).toEqual(rows);
  });
  it('derives station access from authenticated actors', () => {
    expect(scopeCatalog(rows, {kind:'kiosk',stationId:'a'}, r => r.id)).toEqual([rows[0]]);
    expect(() => scopeCatalog(rows, {kind:'kiosk'}, r => r.id)).toThrow();
    expect(scopeCatalog(rows, {kind:'control',userId:'u',role:'staff',permissions:[],global:false,stationIds:['b']}, r => r.id)).toEqual([rows[1]]);
  });
  it('uses legacy persistence by default and fails closed when HTTP is misconfigured', async () => {
    const reader = new CatalogReader(new ConfigService({}));
    expect(reader.enabled()).toBe(false);
    await expect(reader.read('stations')).rejects.toThrow('Catalog configuration missing');
  });
});

describe('Catalog HTTP boundary', () => {
  afterEach(() => jest.restoreAllMocks());
  it('sends only the internal key and canonical route, preserving JSON', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[{"id":"a"}]'));
    const reader = new CatalogReader(new ConfigService({CATALOG_READ_ADAPTER:'http',CATALOG_INTERNAL_URL:'http://internal:3000',CATALOG_API_KEY:'k'.repeat(32)}));
    expect(reader.enabled()).toBe(true);
    expect(await reader.read('stations')).toEqual([{id:'a'}]);
    expect(String(fetchMock.mock.calls[0][0])).toBe('http://internal:3000/api/v1/stations');
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({'x-catalog-key':'k'.repeat(32)});
  });
  it('returns 503 on dependency failure without retries', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockRejectedValue(Error('down'));
    const reader = new CatalogReader(new ConfigService({CATALOG_INTERNAL_URL:'http://internal',CATALOG_API_KEY:'k'.repeat(32)}));
    await expect(reader.read('stations')).rejects.toThrow('Catalog unavailable');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
