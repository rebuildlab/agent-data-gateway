import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { ConfigSchema, type Config } from './types.js';

export function loadConfig(path: string): Config {
  const raw = readFileSync(path, 'utf-8');
  const parsed = parse(raw);
  const result = ConfigSchema.safeParse(parsed);

  if (!result.success) {
    const errors = result.error.issues.map(
      (i) => `  ${i.path.join('.')}: ${i.message}`
    ).join('\n');
    throw new Error(`Config validation failed:\n${errors}`);
  }

  return result.data;
}
