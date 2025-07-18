import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

let _dbPromise: Promise<SQLiteDatabase> | null = null;

/**
 * Open (or create) the database and ensure all tables exist.
 * Uses a single shared promise to avoid concurrent init races.
 */
async function getDB(): Promise<SQLiteDatabase> {
  if (!_dbPromise) {
    _dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('stock-manager.db');

      // ----- Main (China) & Secondary (Brazil) stock -----
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS main_stock (
          id       INTEGER PRIMARY KEY AUTOINCREMENT,
          name     TEXT    NOT NULL UNIQUE,
          quantity INTEGER NOT NULL
        );
      `);
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS secondary_stock (
          id       INTEGER PRIMARY KEY REFERENCES main_stock(id),
          name     TEXT    NOT NULL,
          quantity INTEGER NOT NULL
        );
      `);

      // ----- Pricing -----
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS prices (
          article_id INTEGER PRIMARY KEY REFERENCES main_stock(id),
          price      REAL    NOT NULL
        );
      `);

      // ----- In‑Memory Cart (legacy) -----
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS cart (
          article_id INTEGER PRIMARY KEY REFERENCES main_stock(id),
          quantity   INTEGER NOT NULL
        );
      `);

      // ----- Client map pins -----
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS clients (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          name      TEXT    NOT NULL,
          latitude  REAL    NOT NULL,
          longitude REAL    NOT NULL
        );
      `);

      // ----- Saved Carts Persistence -----
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS saved_carts (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          client      TEXT    NOT NULL,
          created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        );
      `);
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS saved_cart_items (
          cart_id     INTEGER NOT NULL REFERENCES saved_carts(id) ON DELETE CASCADE,
          article_id  INTEGER NOT NULL REFERENCES main_stock(id),
          quantity    INTEGER NOT NULL,
          price       REAL    NOT NULL,
          PRIMARY KEY (cart_id, article_id)
        );
      `);

      return db;
    })();

    // If initialization fails, reset _dbPromise so future calls can retry
    _dbPromise = _dbPromise.catch(err => {
      _dbPromise = null;
      throw err;
    });
  }

  return _dbPromise;
}

/** Types used throughout the app */
export type Article           = { id: number; name: string; quantity: number };
export type Price             = { article_id: number; price: number };
export type CartItem          = { article_id: number; quantity: number; name: string; price: number };
export type ClientPin         = { id: number; name: string; latitude: number; longitude: number };
export type SavedCartSummary  = { id: number; client: string; created_at: number; total: number };
export type SavedCartItem     = { article_id: number; name: string; quantity: number; price: number };

/** Ensure DB is open and initialized */
export async function initDB(): Promise<void> {
  await getDB();
}

////////////////////////////////////////////////////////////////////////////////
// China Stock API (stored in main_stock)
////////////////////////////////////////////////////////////////////////////////

export async function addArticle(name: string, quantity: number): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO main_stock (name, quantity)
       VALUES (?, ?)
     ON CONFLICT(name) DO UPDATE
       SET quantity = main_stock.quantity + excluded.quantity;`,
    name,
    quantity
  );
}

export async function fetchArticles(): Promise<Article[]> {
  const db = await getDB();
  return db.getAllAsync<Article>(`SELECT * FROM main_stock;`);
}

export async function fetchTotalQuantity(): Promise<number> {
  const db = await getDB();
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT SUM(quantity) AS total FROM main_stock;`
  );
  return row?.total ?? 0;
}

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

export async function deleteArticle(id: number): Promise<void> {
  const db = await getDB();
  await db.runAsync(`DELETE FROM main_stock WHERE id = ?;`, id);
}

////////////////////////////////////////////////////////////////////////////////
// Stock Transfer (China ⇄ Brazil)
////////////////////////////////////////////////////////////////////////////////

export async function fetchMainStock(): Promise<Article[]> {
  return fetchArticles();
}

export async function fetchSecondaryStock(): Promise<Article[]> {
  const db = await getDB();
  return db.getAllAsync<Article>(`SELECT * FROM secondary_stock;`);
}

export async function moveToSecondary(id: number, qty: number): Promise<void> {
  const db = await getDB();
  await db.execAsync(`SAVEPOINT sp_move;`);
  try {
    const main = await db.getFirstAsync<{ quantity: number }>(
      `SELECT quantity FROM main_stock WHERE id = ?;`,
      id
    );
    if (!main || main.quantity < qty) throw new Error('Insufficient China stock');

    // 1) subtract from main_stock
    await db.runAsync(
      `UPDATE main_stock SET quantity = quantity - ? WHERE id = ?;`,
      qty,
      id
    );

    // 2) upsert into secondary_stock
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

    // 3) **delete** any main_stock row now at zero
    await db.runAsync(
      `DELETE FROM main_stock WHERE id = ? AND quantity = 0;`,
      id
    );

    await db.execAsync(`RELEASE SAVEPOINT sp_move;`);
  } catch (e) {
    await db.execAsync(`ROLLBACK TO SAVEPOINT sp_move;`);
    throw e;
  }
}

export async function sellSecondary(id: number, qty: number): Promise<void> {
  const db = await getDB();
  await db.execAsync(`SAVEPOINT sp_sell;`);
  try {
    const sec = await db.getFirstAsync<{ quantity: number }>(
      `SELECT quantity FROM secondary_stock WHERE id = ?;`,
      id
    );
    if (!sec || sec.quantity < qty) throw new Error('Insufficient Brazil stock');

    // subtract from secondary_stock
    await db.runAsync(
      `UPDATE secondary_stock SET quantity = quantity - ? WHERE id = ?;`,
      qty,
      id
    );

    // **delete** any secondary_stock row now at zero
    await db.runAsync(
      `DELETE FROM secondary_stock WHERE id = ? AND quantity = 0;`,
      id
    );

    await db.execAsync(`RELEASE SAVEPOINT sp_sell;`);
  } catch (e) {
    await db.execAsync(`ROLLBACK TO SAVEPOINT sp_sell;`);
    throw e;
  }
}


export async function returnToMain(id: number, qty: number): Promise<void> {
  const db = await getDB();
  await db.execAsync(`SAVEPOINT sp_return;`);
  try {
    const sec = await db.getFirstAsync<{ quantity: number }>(
      `SELECT quantity FROM secondary_stock WHERE id = ?;`,
      id
    );
    if (!sec || sec.quantity < qty) throw new Error('Insufficient Brazil stock to return');

    await db.runAsync(
      `UPDATE secondary_stock SET quantity = quantity - ? WHERE id = ?;`,
      qty,
      id
    );
    await db.runAsync(
      `DELETE FROM secondary_stock WHERE id = ? AND quantity = 0;`,
      id
    );
    await db.runAsync(
      `UPDATE main_stock SET quantity = quantity + ? WHERE id = ?;`,
      qty,
      id
    );

    await db.execAsync(`RELEASE SAVEPOINT sp_return;`);
  } catch (e) {
    await db.execAsync(`ROLLBACK TO SAVEPOINT sp_return;`);
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
    `INSERT INTO prices (article_id, price)
       VALUES (?, ?)
     ON CONFLICT(article_id) DO UPDATE
       SET price = excluded.price;`,
    article_id,
    price
  );
}

////////////////////////////////////////////////////////////////////////////////
// In‑Memory Cart API (legacy)
////////////////////////////////////////////////////////////////////////////////

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
    JOIN main_stock m ON m.id=c.article_id
    LEFT JOIN prices p ON p.article_id=c.article_id;
    `
  );
}

export async function addToCart(article_id: number, quantity: number): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO cart (article_id, quantity)
       VALUES (?,?)
     ON CONFLICT(article_id) DO UPDATE
       SET quantity=excluded.quantity;`,
    article_id,
    quantity
  );
}

export async function clearCart(): Promise<void> {
  const db = await getDB();
  await db.execAsync(`DELETE FROM cart;`);
}

export async function fetchCartTotal(): Promise<number> {
  const db = await getDB();
  const row = await db.getFirstAsync<{ total: number }>(
    `
    SELECT SUM(c.quantity * IFNULL(p.price,0)) AS total
    FROM cart c
    LEFT JOIN prices p ON p.article_id=c.article_id;
    `
  );
  return row?.total ?? 0;
}

////////////////////////////////////////////////////////////////////////////////
// Persisted Cart API (fixed)
////////////////////////////////////////////////////////////////////////////////

export async function saveCart(
  client: string,
  items: { article_id: number; quantity: number; price: number }[]
): Promise<void> {
  const db = await getDB();
  await db.execAsync(`BEGIN TRANSACTION;`);
  try {
    await db.runAsync(
      `INSERT INTO saved_carts (client) VALUES (?);`,
      client
    );
    const row = await db.getFirstAsync<{ id: number }>(
      `SELECT last_insert_rowid() AS id;`
    );
    if (!row) throw new Error('Failed to retrieve new cart ID');
    const cartId = row.id;

    for (const it of items) {
      await db.runAsync(
        `INSERT INTO saved_cart_items (cart_id, article_id, quantity, price)
           VALUES (?, ?, ?, ?);`,
        cartId,
        it.article_id,
        it.quantity,
        it.price
      );
    }

    await db.execAsync(`COMMIT;`);
  } catch (e) {
    await db.execAsync(`ROLLBACK;`);
    throw e;
  }
}

export async function fetchSavedCarts(): Promise<SavedCartSummary[]> {
  const db = await getDB();
  return db.getAllAsync<SavedCartSummary>(
    `
    SELECT
      sc.id,
      sc.client,
      sc.created_at,
      IFNULL(SUM(sci.quantity * sci.price),0) AS total
    FROM saved_carts sc
    LEFT JOIN saved_cart_items sci ON sci.cart_id=sc.id
    GROUP BY sc.id
    ORDER BY sc.created_at DESC;
    `
  );
}

export async function fetchCartItems(cartId: number): Promise<SavedCartItem[]> {
  const db = await getDB();
  return db.getAllAsync<SavedCartItem>(
    `
    SELECT
      sci.article_id,
      m.name,
      sci.quantity,
      sci.price
    FROM saved_cart_items sci
    JOIN main_stock m ON m.id = sci.article_id
    WHERE sci.cart_id = ?;
    `,
    cartId
  );
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
    `INSERT INTO clients (name, latitude, longitude) VALUES (?,?,?);`,
    name,
    latitude,
    longitude
  );
}

export async function deleteClient(id: number): Promise<void> {
  const db = await getDB();
  await db.runAsync(`DELETE FROM clients WHERE id=?;`, id);
}
