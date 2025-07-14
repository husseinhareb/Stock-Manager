// db.ts
import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

let dbInstance: SQLiteDatabase | null = null;

/** Lazily open (or return) the database. */
async function getDB(): Promise<SQLiteDatabase> {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync('china_stock.db');  // :contentReference[oaicite:8]{index=8}
  }
  return dbInstance;
}

/** Create the articles table if it doesn't exist. */
export async function initDB(): Promise<void> {
  const db = await getDB();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      quantity INTEGER NOT NULL
    );
  `);  // :contentReference[oaicite:9]{index=9}
}

/** Insert a new article record. */
export async function addArticle(
  name: string,
  quantity: number
): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    'INSERT INTO articles (name, quantity) VALUES (?, ?);',
    name,
    quantity
  );  // :contentReference[oaicite:10]{index=10}
}

/** Fetch all articles as an array. */
export async function fetchArticles(): Promise<
  Array<{ id: number; name: string; quantity: number }>
> {
  const db = await getDB();
  return db.getAllAsync<{ id: number; name: string; quantity: number }>(
    'SELECT * FROM articles;'
  );  // :contentReference[oaicite:11]{index=11}
}

/** Compute the total quantity of all articles. */
export async function fetchTotalQuantity(): Promise<number> {
  const db = await getDB();
  const row = await db.getFirstAsync<{ total: number }>(
    'SELECT SUM(quantity) AS total FROM articles;'
  );  // :contentReference[oaicite:12]{index=12}

  // getFirstAsync returns null if no rows; default to 0
  return row?.total ?? 0;  // :contentReference[oaicite:13]{index=13}
}
