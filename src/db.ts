// src/db.ts
import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

/** Shared DB instance */
let _db: SQLiteDatabase | null = null;
async function getDB(): Promise<SQLiteDatabase> {
  if (!_db) {
    _db = await SQLite.openDatabaseAsync('stock-manager.db');

    // ----- Old articles table (for ChinaStockScreen) -----
    await _db.execAsync(`
      CREATE TABLE IF NOT EXISTS articles (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        name     TEXT    NOT NULL,
        quantity INTEGER NOT NULL
      );
    `);

    // ----- New main/secondary stock tables -----
    await _db.execAsync(`
      CREATE TABLE IF NOT EXISTS main_stock (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        name     TEXT    NOT NULL UNIQUE,
        quantity INTEGER NOT NULL
      );
    `);
    await _db.execAsync(`
      CREATE TABLE IF NOT EXISTS secondary_stock (
        id       INTEGER PRIMARY KEY REFERENCES main_stock(id),
        name     TEXT    NOT NULL,
        quantity INTEGER NOT NULL
      );
    `);

    // ----- Pricing table -----
    await _db.execAsync(`
      CREATE TABLE IF NOT EXISTS prices (
        article_id INTEGER PRIMARY KEY REFERENCES main_stock(id),
        price      REAL    NOT NULL
      );
    `);

    // ----- Cart table -----
    await _db.execAsync(`
      CREATE TABLE IF NOT EXISTS cart (
        article_id INTEGER PRIMARY KEY REFERENCES main_stock(id),
        quantity   INTEGER NOT NULL
      );
    `);

    // ----- Client map pins -----
    await _db.execAsync(`
      CREATE TABLE IF NOT EXISTS clients (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        name      TEXT    NOT NULL,
        latitude  REAL    NOT NULL,
        longitude REAL    NOT NULL
      );
    `);
  }
  return _db;
}

export type Article    = { id: number; name: string; quantity: number };
export type Price      = { article_id: number; price: number };
export type CartItem   = { article_id: number; quantity: number; name: string; price: number };
export type ClientPin  = { id: number; name: string; latitude: number; longitude: number };

////////////////////////////////////////////////////////////////////////////////
// OLD API – for ChinaStockScreen (articles table)
////////////////////////////////////////////////////////////////////////////////

/** Create articles table if missing */
export async function initDB(): Promise<void> {
  await getDB();
}

/** Add a new article record */
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

/** Total up all article quantities */
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
  await db.runAsync(`DELETE FROM articles WHERE id = ?;`, id);
}

////////////////////////////////////////////////////////////////////////////////
// NEW API – main_stock & secondary_stock (China ⇄ Brazil)
////////////////////////////////////////////////////////////////////////////////

/** Fetch all from main_stock (China) */
export async function fetchMainStock(): Promise<Article[]> {
  const db = await getDB();
  return db.getAllAsync<Article>(`SELECT * FROM main_stock;`);
}

/** Fetch all from secondary_stock (Brazil) */
export async function fetchSecondaryStock(): Promise<Article[]> {
  const db = await getDB();
  return db.getAllAsync<Article>(`SELECT * FROM secondary_stock;`);
}

/** Move quantity from main → secondary stock */
export async function moveToSecondary(id: number, qty: number): Promise<void> {
  const db = await getDB();
  await db.execAsync('BEGIN TRANSACTION;');
  try {
    const main = await db.getFirstAsync<{ quantity: number }>(
      `SELECT quantity FROM main_stock WHERE id = ?;`,
      id
    );
    if (!main || main.quantity < qty) {
      throw new Error('Insufficient main stock');
    }
    await db.runAsync(
      `UPDATE main_stock SET quantity = quantity - ? WHERE id = ?;`,
      qty,
      id
    );
    const sec = await db.getFirstAsync<{ quantity: number }>(
      `SELECT quantity FROM secondary_stock WHERE id = ?;`,
      id
    );
    if (sec) {
      await db.runAsync(
        `UPDATE secondary_stock SET quantity = quantity + ? WHERE id = ?;`,
        qty,
        id
      );
    } else {
      await db.runAsync(
        `INSERT INTO secondary_stock (id, name, quantity)
         VALUES (?, (SELECT name FROM main_stock WHERE id = ?), ?);`,
        id,
        id,
        qty
      );
    }
    await db.execAsync('COMMIT;');
  } catch (e) {
    await db.execAsync('ROLLBACK;');
    throw e;
  }
}

/** Sell from the Brazil stock */
export async function sellSecondary(id: number, qty: number): Promise<void> {
  const db = await getDB();
  await db.execAsync('BEGIN TRANSACTION;');
  try {
    const sec = await db.getFirstAsync<{ quantity: number }>(
      `SELECT quantity FROM secondary_stock WHERE id = ?;`,
      id
    );
    if (!sec || sec.quantity < qty) {
      throw new Error('Insufficient Brazil stock');
    }
    await db.runAsync(
      `UPDATE secondary_stock SET quantity = quantity - ? WHERE id = ?;`,
      qty,
      id
    );
    await db.execAsync('COMMIT;');
  } catch (e) {
    await db.execAsync('ROLLBACK;');
    throw e;
  }
}

////////////////////////////////////////////////////////////////////////////////
// Pricing API
////////////////////////////////////////////////////////////////////////////////

/** Fetch all prices */
export async function fetchPrices(): Promise<Price[]> {
  const db = await getDB();
  return db.getAllAsync<Price>(`SELECT * FROM prices;`);
}

/** Set or update price of one article */
export async function setPrice(article_id: number, price: number): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `
    INSERT INTO prices (article_id, price)
    VALUES (?, ?)
    ON CONFLICT(article_id) DO UPDATE SET price = excluded.price;
    `,
    article_id,
    price
  );
}

////////////////////////////////////////////////////////////////////////////////
// Cart API
////////////////////////////////////////////////////////////////////////////////

/** Fetch cart items (with name & price) */
export async function fetchCart(): Promise<CartItem[]> {
  const db = await getDB();
  return db.getAllAsync<CartItem>(
    `
    SELECT
      c.article_id,
      c.quantity,
      m.name,
      IFNULL(p.price,0) AS price
    FROM cart c
    JOIN main_stock m ON m.id = c.article_id
    LEFT JOIN prices p ON p.article_id = c.article_id;
    `
  );
}

/** Add/update one item in the cart */
export async function addToCart(article_id: number, quantity: number): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `
    INSERT INTO cart (article_id, quantity)
    VALUES (?, ?)
    ON CONFLICT(article_id) DO UPDATE SET quantity = excluded.quantity;
    `,
    article_id,
    quantity
  );
}

/** Remove one from cart */
export async function removeFromCart(article_id: number): Promise<void> {
  const db = await getDB();
  await db.runAsync(`DELETE FROM cart WHERE article_id = ?;`, article_id);
}

/** Clear entire cart */
export async function clearCart(): Promise<void> {
  const db = await getDB();
  await db.execAsync(`DELETE FROM cart;`);
}

/** Sum total cost of cart */
export async function fetchCartTotal(): Promise<number> {
  const db = await getDB();
  const row = await db.getFirstAsync<{ total: number }>(
    `
    SELECT SUM(c.quantity * IFNULL(p.price,0)) AS total
    FROM cart c
    LEFT JOIN prices p ON p.article_id = c.article_id;
    `
  );
  return row?.total ?? 0;
}

////////////////////////////////////////////////////////////////////////////////
// Client Map Pins API
////////////////////////////////////////////////////////////////////////////////

/** Fetch all client pins */
export async function fetchClients(): Promise<ClientPin[]> {
  const db = await getDB();
  return db.getAllAsync<ClientPin>(`SELECT * FROM clients;`);
}

/** Add a new pin */
export async function addClient(
  name: string,
  latitude: number,
  longitude: number
): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO clients (name, latitude, longitude) VALUES (?, ?, ?);`,
    name,
    latitude,
    longitude
  );
}

/** Delete a pin */
export async function deleteClient(id: number): Promise<void> {
  const db = await getDB();
  await db.runAsync(`DELETE FROM clients WHERE id = ?;`, id);
}
