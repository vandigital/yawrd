// Let the existing Node test runner render local TSX without another dependency.
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && context.parentURL && !/\.[a-z]+$/i.test(specifier)) {
      for (const extension of [".tsx", ".ts"]) {
        const url = new URL(specifier + extension, context.parentURL);
        if (existsSync(url)) return nextResolve(url.href, context);
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".tsx")) {
      return { format: "module", shortCircuit: true, source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
      }).outputText };
    }
    return nextLoad(url, context);
  },
});
