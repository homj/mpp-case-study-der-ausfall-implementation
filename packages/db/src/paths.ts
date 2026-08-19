import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Directory that holds the case-study JSON files. `DATA_DIR` wins; otherwise we
 * resolve `data/` at the repository root, relative to this file.
 */
export function dataDir(): string {
  const fromEnv = process.env.DATA_DIR;
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
  return fileURLToPath(new URL('../../../data/', import.meta.url));
}

export function migrationsFolder(): string {
  return fileURLToPath(new URL('../drizzle/', import.meta.url));
}

export function dataFile(name: string): string {
  const base = dataDir();
  const path = base.endsWith('/') ? `${base}${name}` : `${base}/${name}`;
  if (!existsSync(path)) {
    throw new Error(`Data file not found: ${path}. Set DATA_DIR to the folder that holds ${name}.`);
  }
  return path;
}
