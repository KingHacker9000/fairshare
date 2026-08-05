import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { env } from './env.js';

export const db = new Database(env.DATABASE_PATH);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');

const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url));
db.exec(readFileSync(schemaPath, 'utf8'));

export function nowIso(): string {
  return new Date().toISOString();
}

export function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}

export function json<T>(value: unknown): T {
  return JSON.parse(String(value)) as T;
}

export function emitChange(userIds: string[], entityType: string, entityId: string, operation: string, payload: unknown): void {
  const statement = db.prepare(
    `INSERT INTO changes (user_id, entity_type, entity_id, operation, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const createdAt = nowIso();
  const payloadJson = JSON.stringify(payload);
  for (const userId of new Set(userIds)) statement.run(userId, entityType, entityId, operation, payloadJson, createdAt);
}

export function groupUserIds(groupId: string): string[] {
  return db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(groupId).map((row: any) => String(row.user_id));
}
