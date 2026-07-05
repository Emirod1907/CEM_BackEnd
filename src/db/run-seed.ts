import dotenv from 'dotenv';
import db from './connection';
import { seed } from './seed';

dotenv.config();

const run = async () => {
  try {
    await db.authenticate();
    await seed();
    console.log('[DB] Seed ejecutado correctamente.');
  } finally {
    await db.close();
  }
};

run().catch((error) => {
  console.error('[DB] Error ejecutando seed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
