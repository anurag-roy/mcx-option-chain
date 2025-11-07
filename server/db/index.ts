import { env } from '@server/lib/env';
import { drizzle } from 'drizzle-orm/libsql';

export const db = drizzle(env.DATABASE_URL, { casing: 'snake_case' });
export const closeDb = () => db.$client.close();
