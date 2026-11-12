// Allowlist only: never publish errors, attachments, requests or response bodies.
const fs = require('node:fs');
const path = require('node:path');
const dir = path.resolve(__dirname, '../../Docs/astra/evidence');
const report = JSON.parse(fs.readFileSync(path.join(dir, 'browser-results.json')));
const tests = [];
function walk(suites) {
  for (const suite of suites || []) {
    for (const spec of suite.specs || []) for (const test of spec.tests || []) {
      tests.push({ title: spec.title, project: test.projectName, status: test.status,
        results: test.results.map(r => ({ status: r.status, duration: r.duration })) });
    }
    walk(suite.suites);
  }
}
walk(report.suites);
fs.writeFileSync(path.join(dir, 'browser-public-summary.json'), JSON.stringify({
  stats: { expected: report.stats.expected, unexpected: report.stats.unexpected,
    skipped: report.stats.skipped, flaky: report.stats.flaky }, tests,
}, null, 2));
