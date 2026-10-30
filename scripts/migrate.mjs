// Explicit operator command only. Never runs during build or request handling.
import './load-migration-environment.mjs';
import { neon } from '@neondatabase/serverless';
import { migrate } from './migrations.mjs';
import { developmentMigrationDatabaseUrl } from '../src/participants/database-config.ts';

try {
  await migrate(neon(developmentMigrationDatabaseUrl()));
  console.log('Yawrd migrations applied or already current.');
} catch {
  console.error('Yawrd migration failed. Confirm the development endpoint pin, configuration and database with its owner. No connection details were logged.');
  process.exitCode = 1;
}
