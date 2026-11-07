import './register-tsx.mjs';
import { registerHooks } from 'node:module';
// Test-only marker stub. Production Next builds enforce the real server boundary.
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export{}', shortCircuit: true };
  return next(specifier, context);
} });
