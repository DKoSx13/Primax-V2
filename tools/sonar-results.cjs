const fs = require("node:fs");
async function main() {
  const origin = process.env.SONAR_LOCAL_URL || "http://127.0.0.1:26900";
  const url = new URL(origin);
  if (!["127.0.0.1", "localhost"].includes(url.hostname))
    throw Error("Sonar results must use the local server");
  if (!process.env.SONAR_TOKEN)
    throw Error("SONAR_TOKEN is required; never commit it");
  const get = async (path) => {
    const r = await fetch(origin + path, {
      headers: { Authorization: "Bearer " + process.env.SONAR_TOKEN },
    });
    if (!r.ok) throw Error("Sonar API HTTP " + r.status);
    return r.json();
  };
  const project = "primax-v2-local";
  const [metrics, bugs, hotspots, criticalSmells] = await Promise.all([
    get(
      "/api/measures/component?component=" +
        project +
        "&metricKeys=bugs,vulnerabilities,security_hotspots,code_smells,duplicated_lines_density,coverage,ncloc",
    ),
    get(
      "/api/issues/search?componentKeys=" +
        project +
        "&types=BUG,VULNERABILITY&ps=100",
    ),
    get("/api/hotspots/search?project=" + project + "&ps=100"),
    get(
      "/api/issues/search?componentKeys=" +
        project +
        "&types=CODE_SMELL&severities=BLOCKER,CRITICAL&ps=100",
    ),
  ]);
  const output = process.argv[2];
  if (!output) throw Error("Provide the output JSON path");
  fs.writeFileSync(
    output,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        metrics,
        bugs,
        hotspots,
        criticalSmells,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(metrics.component.measures);
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
