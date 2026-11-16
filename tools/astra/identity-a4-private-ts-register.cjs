// Test-process-only transpiler using the cached tool image; no install or emit on disk.
const fs = require("node:fs"), Module = require("node:module");
const ts = Module.createRequire("/app/package.json")("typescript");
require.extensions[".ts"] = (module, file) => {
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
      experimentalDecorators: true, emitDecoratorMetadata: true, esModuleInterop: true },
  });
  module._compile(output.outputText, file);
};
