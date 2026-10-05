import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const dir = fileURLToPath(new URL('../../data/', import.meta.url));
mkdirSync(dir, { recursive: true });

// Separate files so mock data never leaks into the real event's state.
const db = new Database(dir + (config.mock ? 'mock.db' : 'live.db'));
db.pragma('journal_mode = WAL');
db.exec('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)');

const getStmt = db.prepare<[string], { value: string }>('SELECT value FROM kv WHERE key = ?');
const setStmt = db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

export const kv = {
  get<T>(key: string): T | undefined {
    const row = getStmt.get(key);
    return row ? (JSON.parse(row.value) as T) : undefined;
  },
  set(key: string, value: unknown) {
    setStmt.run(key, JSON.stringify(value));
  },
};
