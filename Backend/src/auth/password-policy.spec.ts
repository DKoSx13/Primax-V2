import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RegisterDto } from './register.dto';
import { ResetPasswordDto } from './password-reset.dto';
import { PasswordResetService } from './password-reset.service';

describe('Prime password policy', () => {
  it.each(['Primax12!', 'Cliente1#'])('accepts %s', async (password) => {
    const errors = await validate(plainToInstance(RegisterDto, { password }));
    expect(errors.find((error) => error.property === 'password')).toBeUndefined();
  });

  it.each(['primax12!', 'PRIMAX12!', 'Primaxxx!', 'Primax123', 'Pr1!'])('rejects %s', async (password) => {
    const errors = await validate(plainToInstance(RegisterDto, { password }));
    expect(errors.find((error) => error.property === 'password')).toBeDefined();
  });
});

describe('password reset by account type', () => {
  const resetToken = 'A'.repeat(43);
  const reset = async (control: boolean, password: string) => {
    const update = jest.fn();
    const tx = {
      passwordReset: {
        findUnique: jest.fn().mockResolvedValue({ id: 'reset', userId: 'user', user: { active: true }, usedAt: null, verifiedAt: new Date(), expiresAt: new Date(Date.now() + 60000) }),
        update: jest.fn(),
      },
      adminControlAccount: { findUnique: jest.fn().mockResolvedValue(control ? { id: 'control' } : null) },
      userPermissionGrant: { findFirst: jest.fn().mockResolvedValue(null) },
      user: { update },
    };
    const db = { atomic: (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) };
    const service = new PasswordResetService(db as never, {} as never, {} as never);
    return { result: service.reset({ resetToken, password }), update };
  };

  it('accepts simple Control password with bcrypt cost 12', async () => {
    const { result, update } = await reset(true, 'Primax123');
    await result;
    expect(update.mock.calls[0][0].data.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });

  it('rejects a simple Prime password in Backend', async () => {
    const { result, update } = await reset(false, 'Primax123');
    await expect(result).rejects.toThrow('contraseña Prime');
    expect(update).not.toHaveBeenCalled();
  });

  it('accepts Prime password with bcrypt cost 12', async () => {
    const { result, update } = await reset(false, 'Primax12!');
    await result;
    expect(update.mock.calls[0][0].data.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });

  it('requires at least eight characters for either reset', async () => {
    const errors = await validate(plainToInstance(ResetPasswordDto, { password: 'Short1!', resetToken }));
    expect(errors.find((error) => error.property === 'password')).toBeDefined();
  });
});
