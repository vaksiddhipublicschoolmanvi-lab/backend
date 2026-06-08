import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './pool.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrate() {
  const migrationsDir = path.resolve(__dirname, '../../migrations');

  try {
    const files = (await fs.readdir(migrationsDir))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const migrationPath = path.join(migrationsDir, file);
      const sql = await fs.readFile(migrationPath, 'utf8');

      await pool.query(sql);
      logger.info({ migrationPath }, 'Database migration completed successfully');
    }
  } catch (error) {
    logger.error({ err: error }, 'Database migration failed');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
