import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

// Read-only access to the AssurIA Neon database (HTTP driver, no native deps).
// The offer advisor only runs SELECTs on the `objectif1` schema.

export const SCHEMA = 'objectif1';

let client: NeonQueryFunction<false, false> | null = null;

function sql() {
  const url = process.env.NEON_PGSQL_CONNECTION_STRING;
  if (!url) throw new Error('NEON_PGSQL_CONNECTION_STRING manquant dans .env');
  client ??= neon(url);
  return client;
}

export async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await sql().query(text, params)) as T[];
}
