// src/db.ts
import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

let _db: SQLiteDatabase | null = null;
async function getDB(): Promise<SQLiteDatabase> {
  if (!_db) {
    _db = await SQLite.openDatabaseAsync('stock-manager.db');

    // Main (China) & Secondary (Brazil) stock
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

    // Pricing
    await _db.execAsync(`
      CREATE TABLE IF NOT EXISTS prices (
        article_id INTEGER PRIMARY KEY REFERENCES main_stock(id),
        price      REAL    NOT NULL
      );
    `);

    // Cart
    await _db.execAsync(`
      CREATE TABLE IF NOT EXISTS cart (
        article_id INTEGER PRIMARY KEY REFERENCES main_stock(id),
        quantity   INTEGER NOT NULL
      );
    `);

    // Client pins
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

// --- Types ---
export type Article   = { id: number; name: string; quantity: number };
export type Price     = { article_id: number; price: number };
export type CartItem  = { article_id: number; quantity: number; name: string; price: number };
export type ClientPin = { id: number; name: string; latitude: number; longitude: number };

// --- Initialization ---
export async function initDB(): Promise<void> {
  await getDB();
}

////////////////////////////////////////////////////////////////////////////////
// China Stock API (uses main_stock)
////////////////////////////////////////////////////////////////////////////////
/** Add or increment an article in the China stock */
export async function addArticle(name: string, quantity: number): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `
    INSERT INTO main_stock (name, quantity)
      VALUES (?, ?)
    ON CONFLICT(name) DO UPDATE
      SET quantity = main_stock.quantity + excluded.quantity;
    `,
    name,
    quantity
  );
}

/** Fetch all China articles */
export async function fetchArticles(): Promise<Article[]> {
  const db = await getDB();
  return db.getAllAsync<Article>(`SELECT * FROM main_stock;`);
}

/** Sum total China stock */
export async function fetchTotalQuantity(): Promise<number> {
  const db = await getDB();
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT SUM(quantity) AS total FROM main_stock;`
  );
  return row?.total ?? 0;
}

/** Update a China article */
export async function updateArticle(
  id: number,
  name: string,
  quantity: number
): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `UPDATE main_stock SET name = ?, quantity = ? WHERE id = ?;`,
    name,
    quantity,
    id
  );
}

/** Remove a China article */
export async function deleteArticle(id: number): Promise<void> {
  const db = await getDB();
  await db.runAsync(`DELETE FROM main_stock WHERE id = ?;`, id);
}

////////////////////////////////////////////////////////////////////////////////
// Stock Transfer (China ⇄ Brazil)
////////////////////////////////////////////////////////////////////////////////
/** Alias for fetchArticles() */
export async function fetchMainStock(): Promise<Article[]> {
  return fetchArticles();
}

/** Fetch all Brazil stock */
export async function fetchSecondaryStock(): Promise<Article[]> {
  const db = await getDB();
  return db.getAllAsync<Article>(`SELECT * FROM secondary_stock;`);
}

/** Move qty from China → Brazil */
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

/** Sell qty from Brazil */
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
export async function fetchPrices(): Promise<Price[]> {
  const db = await getDB();
  return db.getAllAsync<Price>(`SELECT * FROM prices;`);
}

export async function setPrice(article_id: number, price: number): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `
    INSERT INTO prices (article_id, price)
      VALUES (?, ?)
    ON CONFLICT(article_id) DO UPDATE
      SET price = excluded.price;
    `,
    article_id,
    price
  );
}

////////////////////////////////////////////////////////////////////////////////
// Cart API
////////////////////////////////////////////////////////////////////////////////
export async function fetchCart(): Promise<CartItem[]> {
  const db = await getDB();
  return db.getAllAsync<CartItem>(
    `
    SELECT
      c.article_id,
      c.quantity,
      m.name,
      IFNULL(p.price, 0) AS price
    FROM cart c
    JOIN main_stock m ON m.id = c.article_id
    LEFT JOIN prices p ON p.article_id = c.article_id;
    `
  );
}

export async function addToCart(article_id: number, quantity: number): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `
    INSERT INTO cart (article_id, quantity)
      VALUES (?, ?)
    ON CONFLICT(article_id) DO UPDATE
      SET quantity = excluded.quantity;
    `,
    article_id,
    quantity
  );
}

export async function removeFromCart(article_id: number): Promise<void> {
  const db = await getDB();
  await db.runAsync(`DELETE FROM cart WHERE article_id = ?;`, article_id);
}

export async function clearCart(): Promise<void> {
  const db = await getDB();
  await db.execAsync(`DELETE FROM cart;`);
}

export async function fetchCartTotal(): Promise<number> {
  const db = await getDB();
  const row = await db.getFirstAsync<{ total: number }>(
    `
    SELECT SUM(c.quantity * IFNULL(p.price, 0)) AS total
    FROM cart c
    LEFT JOIN prices p ON p.article_id = c.article_id;
    `
  );
  return row?.total ?? 0;
}

////////////////////////////////////////////////////////////////////////////////
// Client Pins API
////////////////////////////////////////////////////////////////////////////////
export async function fetchClients(): Promise<ClientPin[]> {
  const db = await getDB();
  return db.getAllAsync<ClientPin>(`SELECT * FROM clients;`);
}

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

export async function deleteClient(id: number): Promise<void> {
  const db = await getDB();
  await db.runAsync(`DELETE FROM clients WHERE id = ?;`, id);
}
