import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { compare } from 'bcryptjs';
import { AdminControlPermission, AdminControlRole } from '@prisma/client';
import { ControlService } from './control.service';

const rootId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const stationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const userId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const basePermissions: AdminControlPermission[] = ['ADMIN_CONTROL_ACCESS', 'ADMIN_DASHBOARD_VIEW'];
const root = { kind: 'control' as const, userId: rootId, role: 'SUPER_ADMIN', global: true, permissions: [], stationIds: [] };

function setup() {
  const tx = {
    user: { create: jest.fn(async ({ data }) => ({ id: userId, ...data })) },
    adminControlAccount: { create: jest.fn(async () => ({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' })) },
    adminStationAssignment: { create: jest.fn(async () => ({})) },
    adminControlGrant: { create: jest.fn(async () => ({})) },
    operationalAuditEvent: { create: jest.fn(async () => ({})) },
  };
  const db = {
    userPermissionGrant: { findFirst: jest.fn(async () => ({ permission: 'SYSTEM_ADMIN' })) },
    station: { findMany: jest.fn(async () => [{ id: stationId }]) },
    user: { findUnique: jest.fn(async () => null) },
    atomic: jest.fn(async (work) => work(tx)),
  };
  const service = new ControlService(db as never, {} as never, {} as never, {} as never);
  const input = { name: 'Cuenta de prueba', email: ' Admin@Example.test ', password: 'ControlTest!123', role: 'ADMIN' as AdminControlRole, stationIds: [stationId], permissions: basePermissions };
  return { service, db, tx, input };
}

describe('Alta administrativa directa de Control', () => {
  it.each(['ADMIN', 'ENCARGADO'] as AdminControlRole[])('SYSTEM_ADMIN crea %s con hash, alcance y auditoría', async (role) => {
    const { service, db, tx, input } = setup();
    const result = await service.createAdministrativeAccount(root, { ...input, role });
    expect(db.userPermissionGrant.findFirst).toHaveBeenCalledWith({ where: { userId: rootId, permission: 'SYSTEM_ADMIN', revokedAt: null } });
    expect(db.atomic).toHaveBeenCalledTimes(1);
    const saved = tx.user.create.mock.calls[0][0].data;
    expect(saved.email).toBe('admin@example.test');
    expect(saved.passwordHash).not.toBe(input.password);
    expect(await compare(input.password, saved.passwordHash)).toBe(true);
    expect(tx.adminControlAccount.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId, role, status: 'APPROVED', approvedByUserId: rootId, emailVerifiedAt: expect.any(Date) }) });
    expect(tx.adminStationAssignment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ stationId, grantedByUserId: rootId }) });
    expect(tx.adminControlGrant.create).toHaveBeenCalledTimes(2);
    expect(tx.operationalAuditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorUserId: rootId, action: 'ADMIN_ACCOUNT_CREATED', targetId: userId }) });
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('passwordHash');
  });

  it.each(['ADMIN', 'ENCARGADO'])('rechaza al actor %s', async (role) => {
    const { service, db, input } = setup();
    await expect(service.createAdministrativeAccount({ ...root, role, global: false }, input)).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.atomic).not.toHaveBeenCalled();
  });

  it('acepta Primax123 con bcrypt cost 12 y rechaza menos de 8 caracteres', async () => {
    const { service, tx, input } = setup();
    await service.createAdministrativeAccount(root, { ...input, password: 'Primax123' });
    expect(tx.user.create.mock.calls[0][0].data.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    await expect(service.createAdministrativeAccount(root, { ...input, password: 'Corta7!' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requiere el permiso SYSTEM_ADMIN incluso con contexto global', async () => {
    const { service, db, input } = setup();
    db.userPermissionGrant.findFirst.mockResolvedValueOnce(null as never);
    await expect(service.createAdministrativeAccount(root, input)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rechaza SUPER_ADMIN y correo duplicado', async () => {
    const { service, db, input } = setup();
    await expect(service.createAdministrativeAccount(root, { ...input, role: 'SUPER_ADMIN' })).rejects.toBeInstanceOf(ForbiddenException);
    db.user.findUnique.mockResolvedValueOnce({ id: userId } as never);
    await expect(service.createAdministrativeAccount(root, input)).rejects.toBeInstanceOf(ConflictException);
    expect(db.atomic).not.toHaveBeenCalled();
  });

  it('exige estación activa y ambos permisos base', async () => {
    const { service, db, input } = setup();
    db.station.findMany.mockResolvedValueOnce([]);
    await expect(service.createAdministrativeAccount(root, input)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createAdministrativeAccount(root, { ...input, stationIds: [] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createAdministrativeAccount(root, { ...input, permissions: ['ADMIN_CONTROL_ACCESS'] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createAdministrativeAccount(root, { ...input, permissions: ['ADMIN_DASHBOARD_VIEW'] })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.atomic).not.toHaveBeenCalled();
  });

  it('propaga un fallo dentro de la operación atómica', async () => {
    const { service, db, tx, input } = setup();
    tx.adminControlGrant.create.mockRejectedValueOnce(new Error('grant rejected'));
    await expect(service.createAdministrativeAccount(root, input)).rejects.toThrow('grant rejected');
    expect(db.atomic).toHaveBeenCalledTimes(1);
    expect(tx.operationalAuditEvent.create).not.toHaveBeenCalled();
  });
});
