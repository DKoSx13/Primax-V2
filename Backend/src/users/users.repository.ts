import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { documentConflict } from '../common/document-conflict';
import { assertIdentity } from '../memberships/profile.dto';
import { nextMembershipNumber } from './membership-number';
import { RegisterDto } from '../auth/register.dto';
import { PrismaService } from '../prisma/prisma.service';
@Injectable()
export class UsersRepository {
  constructor(private readonly db: PrismaService) {}
  async register(dto: RegisterDto, passwordHash: string, id?: string) {
    assertIdentity(dto);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // Nested writes are one database transaction: neither row survives a failure.
        return await this.db.$transaction(async (tx) =>
          tx.user.create({
            data: {
              ...(id ? { id } : {}),
              name: dto.name,
              email: dto.email,
              passwordHash,
              membership: {
                create: {
                  number: await nextMembershipNumber(tx),
                  welcomeAvailable: true,
                  dni: dto.dni,
                  passport: dto.passport,
                  ruc: dto.ruc,
                  businessName: dto.businessName,
                },
              },
            },
            select: { id: true, name: true, email: true, authVersion: true },
          }),
        );
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        )
          throw error;
        const target = String(error.meta?.target);
        if (target.includes('email') || (id && target === 'id'))
          throw new ConflictException(
            'El correo ya está registrado. Inicia sesión.',
          );
        const conflict = documentConflict(error);
        if (conflict) throw new ConflictException(conflict);
        if (!target.includes('number') || attempt === 2) throw error;
      }
    }
    throw new ConflictException(
      'No pudimos crear la membresía. Inténtalo nuevamente.',
    );
  }
  findByEmail(email: string) {
    return this.db.user.findUnique({ where: { email } });
  }
  async findByDni(dni: string) {
    const membership = await this.db.membership.findUnique({
      where: { dni },
      include: { user: true },
    });
    return membership?.user ?? null;
  }
  findById(id: string) {
    return this.db.user.findUnique({ where: { id } });
  }
}
