// Shadow-policy checks only. No provider/public DTO or production actor changed.
module.exports = async function (ctx, options) {
  const assert = require("node:assert/strict"),
    crypto = require("node:crypto"),
    fs = require("node:fs"),
    os = require("node:os"),
    path = require("node:path"),
    httpNode = require("node:http"),
    { execFileSync } = require("node:child_process");
  const c = require("./identity-actor-intent-contract.cjs");
  const {
    db,
    projectLoad,
    u,
    consumerConfig,
    consumerUrl,
    terminal,
    prepare,
    execute,
    expect,
    row,
    once,
    base,
    pass,
  } = ctx;
  const { PrismaService } = projectLoad("./dist/persistence/compatibility-db"),
    { ConfigService } = projectLoad("@nestjs/config"),
    { ConsumerAuthenticator } = projectLoad("./dist/operational/consumer/auth");
  const humanDb = new PrismaService(
    new ConfigService({ IDENTITY_COMPAT_DATABASE_URL: consumerUrl }),
  );
  const auth = new ConsumerAuthenticator(
    humanDb,
    new ConfigService(consumerConfig),
  );
  function req(user) {
    const headers = { authorization: "Bearer " + user.token };
    return {
      headers,
      path: "/consumer/v1/intents/execute",
      originalUrl: "/consumer/v1/intents/execute",
      method: "POST",
      header: (name) => headers[name.toLowerCase()],
    };
  }
  function asHuman(v) {
    return {
      kind: "human",
      subjectId: v.userId,
      generation: v.authVersion,
      permissions: v.permissions,
      stationIds: v.stationIds,
      global: v.global,
      role: v.role,
    };
  }
  try {
    const actor = asHuman(await auth.authenticate(req(u[0]))),
      other = asHuman(await auth.authenticate(req(u[1])));
    const t = await terminal();
    // Private caller persists its nonce BEFORE prepare; it is not sent by the old API.
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), "primax-actor-reference-"),
    );
    fs.chmodSync(dir, 0o700);
    const file = path.join(dir, "caller.json");
    const target = {
      action: "TERMINAL_CREDENTIAL_ISSUE",
      stationId: t.stationId,
      terminalId: t.id,
    };
    try {
      const callerOperationId = c.prepareReference(
        file,
        actor,
        target,
        new Date(Date.now() + 16 * 60000).toISOString(),
      );
      assert.throws(() => c.recoverReference(file, actor, target), {
        code: "PREPARE_OUTCOME_UNKNOWN",
      });
      const reference = await prepare(t),
        r = await row(reference.intentId);
      const env = c.envelope(actor, {
        ...r,
        expiresAt: r.expiresAt.toISOString(),
      });
      assert.deepEqual(c.validate(env, env, actor), env);
      assert.throws(() => c.validate(env, env, other), {
        code: "ACTOR_BINDING_MISMATCH",
      });
      for (const field of ["intentId", "commandId", "terminalId", "stationId"])
        assert.throws(
          () =>
            c.validate({ ...env, [field]: crypto.randomUUID() }, env, actor),
          { code: "PERSISTED_INTENT_CHANGED" },
        );
      assert.throws(
        () =>
          c.validate(
            { ...env, actor: { ...env.actor, permissions: [] } },
            env,
            actor,
          ),
        { code: "PERSISTED_INTENT_CHANGED" },
      );
      assert.throws(() => c.validate(env, env, { ...actor, permissions: [] }), {
        code: "PERMISSION_REVOKED",
      });
      assert.throws(
        () => c.validate(env, env, actor, Date.parse(env.expiresAt) + 1),
        { code: "INTENT_EXPIRED" },
      );
      pass(
        "Actor-intent proposal shadow binds live AuthCore user/epoch, permissions, action, scope, intent, command and expiry; altered requests and other users rejected",
      );

      // Here prepare was acknowledged. A nonce alone cannot recover a lost prepare under the old API.
      c.acknowledgeReference(file, actor, target, {
        intentId: reference.intentId,
        expiresAt: reference.expiresAt,
      });
      let firstStatus;
      const proxy = httpNode.createServer(async (q, s) => {
        try {
          let body = "";
          for await (const chunk of q) body += chunk;
          const response = await fetch(base + "/consumer/v1/intents/execute", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: "Bearer " + u[0].token,
            },
            body,
          });
          firstStatus = response.status;
          await response.text();
          s.destroy();
        } catch {
          s.destroy();
        }
      });
      await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
      try {
        await assert.rejects(
          fetch("http://127.0.0.1:" + proxy.address().port, {
            method: "POST",
            body: JSON.stringify({ intentId: reference.intentId }),
          }),
        );
      } finally {
        proxy.closeAllConnections();
        await new Promise((resolve) => proxy.close(resolve));
      }
      assert.equal(firstStatus, 200);
      await once(t);
      // A genuinely separate client process reads the durable file. It receives no JWT/token on disk.
      const fresh = asHuman(await auth.authenticate(req(u[0])));
      const read = JSON.parse(
        execFileSync(
          process.execPath,
          [
            "-e",
            "const c=require(process.argv[1]); process.stdout.write(JSON.stringify(c.recoverReference(process.argv[2],JSON.parse(process.argv[3]),JSON.parse(process.argv[4]))));",
            path.resolve(__dirname, "identity-actor-intent-contract.cjs"),
            file,
            JSON.stringify(fresh),
            JSON.stringify(target),
          ],
          { encoding: "utf8" },
        ),
      );
      assert.equal(read.callerOperationId, callerOperationId);
      assert.equal(read.intentId, reference.intentId);
      const result = await expect(execute(read.intentId), 200);
      await once(t);
      assert.equal((await row(read.intentId)).commandId, r.commandId);
      const saved = fs.readFileSync(file, "utf8");
      assert.ok(
        !saved.includes(u[0].token) &&
          !saved.includes(result.terminalToken) &&
          !saved.includes(r.commandId),
      );
      assert.throws(() => c.recoverReference(file, other, target), {
        code: "ACTOR_BINDING_MISMATCH",
      });
      assert.throws(
        () =>
          c.recoverReference(file, fresh, {
            ...target,
            terminalId: crypto.randomUUID(),
          }),
        { code: "REQUEST_CHANGED" },
      );
      pass(
        "Private caller persists nonsecret nonce/intent reference: response lost, new client process reloads it, same authenticated operation recovers without another credential/audit",
      );
      const unknownFile = path.join(dir, "unknown.json"),
        unconfirmedTarget = await terminal();
      const unconfirmed = {
        action: "TERMINAL_CREDENTIAL_ISSUE",
        stationId: unconfirmedTarget.stationId,
        terminalId: unconfirmedTarget.id,
      };
      c.prepareReference(
        unknownFile,
        fresh,
        unconfirmed,
        new Date(Date.now() + 16 * 60000).toISOString(),
      );
      let prepareStatus;
      const losePrepare = httpNode.createServer(async (q, s) => {
        try {
          const response = await fetch(base + "/consumer/v1/intents", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: "Bearer " + u[0].token,
            },
            body: JSON.stringify({ terminalId: unconfirmedTarget.id }),
          });
          prepareStatus = response.status;
          await response.text();
          s.destroy();
        } catch {
          s.destroy();
        }
      });
      await new Promise((resolve) =>
        losePrepare.listen(0, "127.0.0.1", resolve),
      );
      try {
        await assert.rejects(
          fetch("http://127.0.0.1:" + losePrepare.address().port, {
            method: "POST",
          }),
        );
      } finally {
        losePrepare.closeAllConnections();
        await new Promise((resolve) => losePrepare.close(resolve));
      }
      assert.equal(prepareStatus, 200);
      assert.equal(
        (
          await db.$queryRawUnsafe(
            'SELECT count(*)::int AS n FROM "IdentityConsumerIntent" WHERE "terminalId"=$1::uuid',
            unconfirmedTarget.id,
          )
        )[0].n,
        1,
      );
      assert.equal(
        await db.terminalCredential.count({
          where: { terminalId: unconfirmedTarget.id },
        }),
        0,
      );
      assert.throws(() => c.recoverReference(unknownFile, fresh, unconfirmed), {
        code: "PREPARE_OUTCOME_UNKNOWN",
      });
      fs.unlinkSync(unknownFile);
      pass(
        "Lost prepare response after actual local commit remains unknown despite durable nonce: no body matching, implicit reprepare, invented actor or credential emission",
      );

      const { AccessGuard } = projectLoad(
          "./dist/compatibility/auth/access.guard",
        ),
        { KioskService } = projectLoad(
          "./dist/compatibility/kiosk/kiosk.service",
        ),
        { KioskStore } = projectLoad("./dist/compatibility/kiosk/redis-store"),
        { Reflector } = projectLoad("@nestjs/core"),
        { JwtService } = projectLoad("@nestjs/jwt");
      const cfg = new ConfigService(options.authConfig),
        terminalDb = new PrismaService(cfg),
        store = new KioskStore(cfg),
        kiosk = new KioskService(cfg, store, terminalDb);
      const handler = () => {};
      Reflect.defineMetadata("access", "terminal", handler);
      const guard = new AccessGuard(
        new Reflector(),
        cfg,
        new JwtService(),
        {},
        kiosk,
        terminalDb,
      );
      async function terminalActor(token, bad = false) {
        const headers = options.signed("terminal/me", {
          technical: token,
          bad,
        });
        const request = {
          method: "GET",
          path: "/api/v1/terminal/me",
          originalUrl: "/api/v1/terminal/me",
          body: null,
          headers,
          header: (name) => headers[name.toLowerCase()],
        };
        await guard.canActivate({
          getHandler: () => handler,
          getClass: () => Object,
          switchToHttp: () => ({ getRequest: () => request }),
        });
        assert.equal(request.actor.kind, "terminal");
        const credential = await db.terminalCredential.findUniqueOrThrow({
          where: { id: request.actor.credentialId },
        });
        return {
          kind: "terminal",
          subjectId: request.actor.terminalId,
          generation: request.actor.credentialId,
          terminalId: request.actor.terminalId,
          stationId: request.actor.stationId,
          permissions: [],
          credentialExpiresAt: credential.expiresAt.toISOString(),
        };
      }
      try {
        const tech = await terminalActor(result.terminalToken),
          techRecord = {
            intentId: crypto.randomUUID(),
            commandId: crypto.randomUUID(),
            action: "TERMINAL_STATUS_READ",
            stationId: tech.stationId,
            terminalId: tech.terminalId,
            expiresAt: new Date(Date.now() + 60000).toISOString(),
          };
        const technical = c.envelope(tech, techRecord);
        assert.deepEqual(c.validate(technical, technical, tech), technical);
        const continuity = c.envelope(tech, {
          ...techRecord,
          action: "TERMINAL_SESSION_RESUME",
        });
        c.validate(continuity, continuity, tech);
        assert.throws(() => c.validate(env, env, tech), {
          code: "ACTOR_BINDING_MISMATCH",
        });
        const issuance = c.envelope(tech, {
          ...techRecord,
          action: "TERMINAL_CREDENTIAL_ISSUE",
        });
        assert.throws(() => c.validate(issuance, issuance, tech), {
          code: "HUMAN_AUTHORITY_REQUIRED",
        });
        await assert.rejects(terminalActor(result.terminalToken, true));
        await assert.rejects(terminalActor(""));
        assert.throws(() => c.envelope({ kind: "gateway" }, techRecord), {
          code: "ACTOR_UNRESOLVED",
        });
        pass(
          "Technical subject comes from original TerminalOnly guard with real HMAC/Redis/PostgreSQL credential; shadow read/continuity only, no fresh-issue or human-actor escalation",
        );
        await db.terminalCredential.update({
          where: { id: tech.generation },
          data: { revokedAt: new Date() },
        });
        await assert.rejects(terminalActor(result.terminalToken));
        await expect(execute(reference.intentId), 409);
        const replacement = await prepare(t),
          newCredential = await expect(execute(replacement.intentId), 200),
          rotated = await terminalActor(newCredential.terminalToken);
        assert.notEqual(rotated.generation, tech.generation);
        assert.throws(() => c.validate(technical, technical, rotated), {
          code: "ACTOR_BINDING_MISMATCH",
        });
        pass(
          "Technical revocation is revalidated by original guard, not by the persisted actor snapshot; bootstrap without credential yields no terminal identity",
        );
      } finally {
        await store.onModuleDestroy();
        await terminalDb.$disconnect();
      }
    } finally {
      for (const filename of [file, path.join(dir, "unknown.json")])
        if (fs.existsSync(filename)) fs.unlinkSync(filename);
      fs.rmdirSync(dir);
    }
  } finally {
    await humanDb.$disconnect();
  }
};
