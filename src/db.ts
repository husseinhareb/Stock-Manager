// src/db.ts
import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

let _db: SQLiteDatabase | null = null;
async function getDB(): Promise<SQLiteDatabase> {
  if (!_db) {
    _db = await SQLite.openDatabaseAsync('stock_manager.db');
    await _db.execAsync(`
      CREATE TABLE IF NOT EXISTS articles (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        name     TEXT    NOT NULL,
        quantity INTEGER NOT NULL
      );
    `);
  }
  return _db;
}

export type Article = { id: number; name: string; quantity: number };

/** Initialize the DB (creates the table if needed) */
export async function initDB(): Promise<void> {
  await getDB();
}

/** Insert a new article */
export async function addArticle(name: string, quantity: number): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO articles (name, quantity) VALUES (?, ?);`,
    name,
    quantity
  );
}

/** Fetch all articles */
export async function fetchArticles(): Promise<Article[]> {
  const db = await getDB();
  return db.getAllAsync<Article>(`SELECT * FROM articles;`);
}

/** Compute total quantity */
export async function fetchTotalQuantity(): Promise<number> {
  const db = await getDB();
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT SUM(quantity) as total FROM articles;`
  );
  return row?.total ?? 0;
}

/** Update an existing article */
export async function updateArticle(
  id: number,
  name: string,
  quantity: number
): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `UPDATE articles SET name = ?, quantity = ? WHERE id = ?;`,
    name,
    quantity,
    id
  );
}

/** Delete an article */
export async function deleteArticle(id: number): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `DELETE FROM articles WHERE id = ?;`,
    id
  );
}
