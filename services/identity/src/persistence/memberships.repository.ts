import { Injectable } from "@nestjs/common";
import { IdentityDatabase } from "./identity-db";
import {
  ProfileDto,
  assertIdentity,
} from "../compatibility/memberships/profile.dto";

@Injectable()
export class MembershipsRepository {
  constructor(private readonly db: IdentityDatabase) {}
  findForUser(userId: string) {
    return this.db.membership.findUnique({
      where: { userId },
      include: {
        user: { select: { name: true, email: true } },
        vehicles: true,
      },
    });
  }
  updateProfile(userId: string, data: ProfileDto) {
    return this.db.atomic(async (tx) => {
      const current = await tx.membership.findUniqueOrThrow({
        where: { userId },
      });
      assertIdentity({
        dni: data.dni === undefined ? current.dni : data.dni,
        passport:
          data.passport === undefined ? current.passport : data.passport,
      });
      return tx.membership.update({ where: { userId }, data });
    });
  }
}
