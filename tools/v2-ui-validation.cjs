const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const {
  chromium,
} = require("../Frontend_2_PrimaxPrime/node_modules/playwright");
const root = path.resolve(process.env.V2_UI_ROOT || path.join(__dirname, ".."));
const mime = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};
function server(port, folder) {
  const base = path.join(root, folder);
  const s = http.createServer((req, res) => {
    let file = path.resolve(
      base,
      "." + new URL(req.url, "http://localhost").pathname,
    );
    if (file === base) file = path.join(base, "index.html");
    if (!file.startsWith(base + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(file, (error, body) => {
      if (error) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": mime[path.extname(file)] || "application/octet-stream",
      });
      res.end(body);
    });
  });
  return new Promise((resolve) =>
    s.listen(port, "127.0.0.1", () => resolve(s)),
  );
}
(async () => {
  const servers = await Promise.all([
    server(26681, "Frontend_1_FuelFlow/src"),
    server(26683, "Frontend_3_PrimaxControl"),
  ]);
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      localStorage.setItem("primax_idioma", "es");
      window.print = () => {
        throw Error("Browser printing forbidden");
      };
    });
    let requestStatus = "PENDIENTE",
      created = 0;
    await page.route("**/api/**", (route) => {
      const u = new URL(route.request().url()),
        body = route.request().postDataJSON();
      let data = { status: "ok" };
      if (u.pathname.endsWith("/terminal/assistance")) {
        assert.equal(body.reason, "OTRO");
        assert.equal(body.observation, "Necesito ayuda local");
        created++;
        data = {
          id: "11111111-1111-4111-8111-111111111111",
          status: requestStatus,
        };
      } else if (u.pathname.includes("/terminal/assistance/")) {
        if (u.pathname.endsWith("/cancel"))
          requestStatus = "CANCELADA_POR_CLIENTE";
        data = {
          id: "11111111-1111-4111-8111-111111111111",
          status: requestStatus,
        };
      } else if (u.pathname.endsWith("/inventory")) data = [];
      return route.fulfill({ json: data });
    });
    await page.goto("http://127.0.0.1:26681/");
    await page.locator("#btn-ayuda").click();
    await page.locator("#help-motivo").selectOption("OTRO");
    await page.locator("#help-observacion").fill("Necesito ayuda local");
    await page.locator("#help-btn-enviar").click();
    await page.getByText("Solicitud pendiente.", { exact: false }).waitFor();
    assert.equal(created, 1);
    await page.locator("#help-btn-cancelar").click();
    await page
      .getByText("Solicitud cancelada por el cliente.", { exact: false })
      .waitFor();
    await page.locator("#help-btn-cerrar").click();
    await page.close();
    const control = await browser.newPage();
    control.on("pageerror", (e) => errors.push(e.message));
    const station = { id: "station-a", code: "SUR", name: "Sur" };
    let assistance = {
      id: "request-a",
      stationId: station.id,
      reason: "AYUDA_GENERAL",
      status: "PENDIENTE",
      terminal: { code: "T01" },
      pump: { code: "03" },
      operationId: "op",
      plate: "ABC-123",
      createdAt: new Date().toISOString(),
      assignedSupervisorId: null,
    };
    await control.route("**/api/**", (route) => {
      const u = new URL(route.request().url());
      let data = [];
      if (u.pathname.endsWith("/control/session"))
        data = {
          user: { id: "supervisor-a", name: "Supervisor" },
          role: "SUPERVISOR",
          roles: ["SUPERVISOR"],
          permissions: [],
          global: false,
          stations: [],
          supervisorStations: [station],
        };
      else if (u.pathname.endsWith("/supervisor/stations"))
        data = [{ stationId: station.id, station }];
      else if (u.pathname.endsWith("/shift"))
        data = {
          shift: {
            id: "shift",
            status: "ABIERTO",
            openedAt: new Date().toISOString(),
          },
        };
      else if (u.pathname.endsWith("/terminals")) data = [];
      else if (u.pathname.endsWith("/assistance")) data = [assistance];
      else if (u.pathname.endsWith("/actions")) {
        const body = route.request().postDataJSON();
        assistance = {
          ...assistance,
          status:
            body.action === "ACCEPT"
              ? "EN_ATENCION"
              : body.action === "RESOLVE"
                ? "RESUELTA"
                : assistance.status,
          assignedSupervisorId: "supervisor-a",
          acceptedAt: new Date().toISOString(),
          ...body,
        };
        data = assistance;
      } else if (u.pathname.endsWith("/assistance/request-a"))
        data = { ...assistance, events: [], incidents: [] };
      return route.fulfill({ json: data });
    });
    await control.goto("http://127.0.0.1:26683/#supervisor");
    await control
      .getByRole("button", { name: "Aceptar solicitud", exact: true })
      .click();
    await control
      .getByRole("button", { name: "Resolver", exact: true })
      .waitFor();
    await control
      .getByRole("button", { name: "Resolver", exact: true })
      .click();
    await control
      .locator("#assistance-dialog [name=result]")
      .fill("Ayuda completada");
    await control.getByRole("button", { name: "Guardar", exact: true }).click();
    await control
      .getByText("AYUDA_GENERAL · RESUELTA", { exact: true })
      .waitFor();
    await control.close();
    assert.deepEqual(errors, []);
    console.log(
      "Browser V2: asistencia cliente/cancelación y Supervisor aceptación/resolución: PASS",
    );
  } finally {
    await browser.close();
    await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
