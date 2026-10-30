// Reuse Next's installed environment loader so CLI commands and the app agree.
// No secret values or loader diagnostics are printed.
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
