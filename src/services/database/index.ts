// Database service layer
import type {
  Article,
  ClientItem,
  ClientPin,
  Price,
  SavedClientItem,
  SavedClientSummary,
} from "@/src/types/database";
import type { SQLiteDatabase } from "expo-sqlite";
import * as SQLite from "expo-sqlite";

// Re-export types for convenience
export type {
  Article, ClientItem,
  ClientPin, Price, SavedClientItem, SavedClientSummary
};

let _dbPromise: Promise<SQLiteDatabase> | null = null;

/** Serialize all writes to avoid “database is locked”. */
let _writeChain: Promise<any> = Promise.resolve();
function withWriteLock<T>(op: () => Promise<T>): Promise<T> {
  const run = () =>
    op().catch((e) => {
      throw e;
    });
  _writeChain = _writeChain.then(run, run);
  return _writeChain;
}

// --- Migrations ---
async function migrateSchema(db: SQLiteDatabase): Promise<void> {
  const ver =
    (await db.getFirstAsync<{ user_version: number }>(`PRAGMA user_version;`))
      ?.user_version ?? 0;

  // v1 -> v2: add ON DELETE CASCADE to prices, client, secondary_stock
  if (ver < 2) {
    await db.execAsync(`BEGIN IMMEDIATE;`);

    // secondary_stock with CASCADE
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS secondary_stock_new (
        id       INTEGER PRIMARY KEY REFERENCES main_stock(id) ON DELETE CASCADE,
        name     TEXT,
        quantity INTEGER NOT NULL CHECK (quantity >= 0)
      );
    `);
    await db.execAsync(`
      INSERT OR REPLACE INTO secondary_stock_new (id, name, quantity)
      SELECT id, name, quantity FROM secondary_stock;
    `);
    await db.execAsync(`DROP TABLE IF EXISTS secondary_stock;`);
    await db.execAsync(`ALTER TABLE secondary_stock_new RENAME TO secondary_stock;`);

    // prices with CASCADE
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS prices_new (
        article_id INTEGER PRIMARY KEY REFERENCES main_stock(id) ON DELETE CASCADE,
        price      REAL NOT NULL CHECK (price >= 0)
      );
    `);
    await db.execAsync(`
      INSERT OR REPLACE INTO prices_new (article_id, price)
      SELECT article_id, price FROM prices;
    `);
    await db.execAsync(`DROP TABLE IF EXISTS prices;`);
    await db.execAsync(`ALTER TABLE prices_new RENAME TO prices;`);

    // client with CASCADE
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS client_new (
        article_id INTEGER PRIMARY KEY REFERENCES main_stock(id) ON DELETE CASCADE,
        quantity   INTEGER NOT NULL CHECK (quantity >= 0)
      );
    `);
    await db.execAsync(`
      INSERT OR REPLACE INTO client_new (article_id, quantity)
      SELECT article_id, quantity FROM client;
    `);
    await db.execAsync(`DROP TABLE IF EXISTS client;`);
    await db.execAsync(`ALTER TABLE client_new RENAME TO client;`);

    await db.execAsync(`PRAGMA user_version = 2;`);
    await db.execAsync(`COMMIT;`);
  }

  // v2 -> v3: decouple saved_client_items from main_stock (keep snapshots even if product is deleted)
  if (ver < 3) {
    await db.execAsync(`BEGIN IMMEDIATE;`);
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS saved_client_items_new (
        client_id   INTEGER NOT NULL REFERENCES saved_clients(id) ON DELETE CASCADE,
        article_id  INTEGER NOT NULL, -- no FK on purpose (snapshot)
        quantity    INTEGER NOT NULL CHECK (quantity >= 0),
        price       REAL    NOT NULL CHECK (price >= 0),
        name        TEXT,
        PRIMARY KEY (client_id, article_id)
      );
    `);
    await db.execAsync(`
      INSERT OR REPLACE INTO saved_client_items_new (client_id, article_id, quantity, price, name)
      SELECT client_id, article_id, quantity, price, name FROM saved_client_items;
    `);
    await db.execAsync(`DROP TABLE IF EXISTS saved_client_items;`);
    await db.execAsync(`ALTER TABLE saved_client_items_new RENAME TO saved_client_items;`);

    await db.execAsync(`PRAGMA user_version = 3;`);
    await db.execAsync(`COMMIT;`);
  }

  // v3 -> v4: add ordering support via main_stock.position and backfill
  if (ver < 4) {
    await db.execAsync(`BEGIN IMMEDIATE;`);
    try {
      try {
        await db.execAsync(`ALTER TABLE main_stock ADD COLUMN position INTEGER;`);
      } catch {}
      // Backfill any NULL positions to current id (stable ordering)
      await db.execAsync(`UPDATE main_stock SET position = id WHERE position IS NULL;`);
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_main_stock_position ON main_stock(position);`);
      await db.execAsync(`PRAGMA user_version = 4;`);
      await db.execAsync(`COMMIT;`);
    } catch (e) {
      await db.execAsync(`ROLLBACK;`);
      throw e;
    }
  }
}

/**
 * Open (or create) the database and ensure all tables exist.
 * Uses a single shared promise to avoid concurrent init races.
 */
async function getDB(): Promise<SQLiteDatabase> {
  if (!_dbPromise) {
    _dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync("stock-manager.db");

      // Better concurrency & fewer “locked” errors
      await db.execAsync(`PRAGMA foreign_keys = ON;`);
      await db.execAsync(`PRAGMA journal_mode = WAL;`);
      await db.execAsync(`PRAGMA synchronous = NORMAL;`);
      await db.execAsync(`PRAGMA busy_timeout = 5000;`);

      // ----- Main (China) & Secondary (Brazil) stock -----
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS main_stock (
          id       INTEGER PRIMARY KEY AUTOINCREMENT,
          name     TEXT    NOT NULL UNIQUE,
          quantity INTEGER NOT NULL CHECK (quantity >= 0),
          position INTEGER
        );
      `);

      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS secondary_stock (
          id       INTEGER PRIMARY KEY REFERENCES main_stock(id),
          name     TEXT,
          quantity INTEGER NOT NULL CHECK (quantity >= 0)
        );
      `);

      // Ensure secondary_stock has name and backfill it (old installs might not)
      try {
        await db.execAsync(`ALTER TABLE secondary_stock ADD COLUMN name TEXT;`);
      } catch {}
      await db.execAsync(`
        UPDATE secondary_stock AS s
           SET name = (SELECT m.name FROM main_stock m WHERE m.id = s.id)
         WHERE (s.name IS NULL OR s.name = '');
      `);

      // ----- Pricing -----
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS prices (
          article_id INTEGER PRIMARY KEY REFERENCES main_stock(id),
          price      REAL    NOT NULL CHECK (price >= 0)
        );
      `);

      // ----- In-Memory Client (legacy) -----
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS client (
          article_id INTEGER PRIMARY KEY REFERENCES main_stock(id),
          quantity   INTEGER NOT NULL CHECK (quantity >= 0)
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

      // ----- Saved Clients Persistence -----
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS saved_clients (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          client      TEXT    NOT NULL,
          created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        );
      `);

      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS saved_client_items (
          client_id     INTEGER NOT NULL REFERENCES saved_clients(id) ON DELETE CASCADE,
          article_id    INTEGER NOT NULL REFERENCES main_stock(id),
          quantity      INTEGER NOT NULL,
          price         REAL    NOT NULL,
          name          TEXT,
          PRIMARY KEY (client_id, article_id)
        );
      `);

      // Try to add a snapshot 'name' column (no-op if it already exists) + backfill
      try {
        await db.execAsync(`ALTER TABLE saved_client_items ADD COLUMN name TEXT;`);
      } catch {}
      await db.execAsync(`
        UPDATE saved_client_items AS sci
           SET name = (SELECT m.name FROM main_stock m WHERE m.id = sci.article_id)
         WHERE sci.name IS NULL OR sci.name = '';
      `);

      // ----- Settings -----
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);

      // Run migrations (idempotent)
      await migrateSchema(db);

      // Ensure position is filled for fresh DBs too
      await db.execAsync(`UPDATE main_stock SET position = id WHERE position IS NULL;`);
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_main_stock_position ON main_stock(position);`);

      return db;
    })().catch((err) => {
      _dbPromise = null;
      throw err;
    });
  }
  return _dbPromise;
}

/** Ensure DB is open and initialized */
export async function initDB(): Promise<void> {
  await getDB();
}

////////////////////////////////////////////////////////////////////////////////
// China Stock API (stored in main_stock)
////////////////////////////////////////////////////////////////////////////////

export async function addArticle(
  name: string,
  quantity: number
): Promise<void> {
  return withWriteLock(async () => {
    const db = await getDB();
    await db.runAsync(
      `INSERT INTO main_stock (name, quantity, position)
         VALUES (?, ?, (SELECT IFNULL(MAX(position),0) + 1 FROM main_stock))
       ON CONFLICT(name) DO UPDATE
         SET quantity = main_stock.quantity + excluded.quantity;`,
      name,
      quantity
    );
  });
}

export async function fetchArticles(): Promise<Article[]> {
  const db = await getDB();
  return db.getAllAsync<Article>(`SELECT id, name, quantity, position FROM main_stock ORDER BY position ASC, name ASC;`);
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
  return withWriteLock(async () => {
    const db = await getDB();
    await db.runAsync(
      `UPDATE main_stock SET name = ?, quantity = ? WHERE id = ?;`,
      name,
      quantity,
      id
    );
  });
}

export async function deleteArticle(id: number): Promise<void> {
  return withWriteLock(async () => {
    const db = await getDB();
    await db.runAsync(`DELETE FROM main_stock WHERE id = ?;`, id);
    // CASCADE clears prices, client, secondary_stock. Saved snapshots remain.
    // We intentionally do not renumber positions here; reorders or inserts will handle gaps.
  });
}

/** Persist a new ordering of all main_stock items by their IDs (first ID becomes position 1, etc). */
export async function reorderArticles(orderedIds: number[]): Promise<void> {
  return withWriteLock(async () => {
    const db = await getDB();
    await db.execAsync(`BEGIN IMMEDIATE;`);
    try {
      // Assign sequential positions based on provided order
      for (let i = 0; i < orderedIds.length; i++) {
        await db.runAsync(
          `UPDATE main_stock SET position = ? WHERE id = ?;`,
          i + 1,
          orderedIds[i]
        );
      }
      await db.execAsync(`COMMIT;`);
    } catch (e) {
      await db.execAsync(`ROLLBACK;`);
      throw e;
    }
  });
}

////////////////////////////////////////////////////////////////////////////////
// Stock Transfer (China ⇄ Brazil)
////////////////////////////////////////////////////////////////////////////////

export async function fetchMainStock(): Promise<Article[]> {
  return fetchArticles();
}

export async function fetchSecondaryStock(): Promise<Article[]> {
  const db = await getDB();
  return db.getAllAsync<Article>(`
    SELECT
      s.id,
      COALESCE(s.name, m.name, '') AS name,
      s.quantity,
      COALESCE(m.position, s.id) AS position
    FROM secondary_stock s
    LEFT JOIN main_stock m ON m.id = s.id
    ORDER BY position ASC, name ASC;
  `);
}

export async function moveToSecondary(id: number, qty: number): Promise<void> {
  return withWriteLock(async () => {
    const db = await getDB();
    await db.execAsync(`SAVEPOINT sp_move;`);
    try {
      const main = await db.getFirstAsync<{ quantity: number; name: string }>(
        `SELECT quantity, name FROM main_stock WHERE id = ?;`,
        id
      );
      if (!main || main.quantity < qty)
        throw new Error("Insufficient China stock");

      // subtract from main_stock
      await db.runAsync(
        `UPDATE main_stock SET quantity = quantity - ? WHERE id = ?;`,
        qty,
        id
      );

      // upsert into secondary_stock with cached name
      await db.runAsync(
        `INSERT INTO secondary_stock (id, name, quantity)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE
           SET quantity = secondary_stock.quantity + excluded.quantity,
               name     = COALESCE(secondary_stock.name, excluded.name);`,
        id,
        main.name,
        qty
      );

      await db.execAsync(`RELEASE SAVEPOINT sp_move;`);
    } catch (e) {
      await db.execAsync(`ROLLBACK TO SAVEPOINT sp_move;`);
      throw e;
    }
  });
}

export async function sellSecondary(id: number, qty: number): Promise<void> {
  return withWriteLock(async () => {
    const db = await getDB();
    await db.execAsync(`SAVEPOINT sp_sell;`);
    try {
      const sec = await db.getFirstAsync<{ quantity: number }>(
        `SELECT quantity FROM secondary_stock WHERE id = ?;`,
        id
      );
      if (!sec || sec.quantity < qty)
        throw new Error("Insufficient Brazil stock");

      await db.runAsync(
        `UPDATE secondary_stock SET quantity = quantity - ? WHERE id = ?;`,
        qty,
        id
      );
      await db.runAsync(
        `DELETE FROM secondary_stock WHERE id = ? AND quantity <= 0;`,
        id
      );

      await db.execAsync(`RELEASE SAVEPOINT sp_sell;`);
    } catch (e) {
      await db.execAsync(`ROLLBACK TO SAVEPOINT sp_sell;`);
      throw e;
    }
  });
}

export async function returnToMain(id: number, qty: number): Promise<void> {
  return withWriteLock(async () => {
    const db = await getDB();
    await db.execAsync(`BEGIN IMMEDIATE;`);
    try {
      // 1) grab both quantity & name from Brazil stock
      const sec = await db.getFirstAsync<{ quantity: number; name: string }>(
        `SELECT quantity, name FROM secondary_stock WHERE id = ?;`,
        id
      );
      if (!sec || sec.quantity < qty) {
        throw new Error("Insufficient Brazil stock to return");
      }

      // 2) subtract from secondary_stock and delete if zero
      await db.runAsync(
        `UPDATE secondary_stock SET quantity = quantity - ? WHERE id = ?;`,
        qty,
        id
      );
      await db.runAsync(
        `DELETE FROM secondary_stock WHERE id = ? AND quantity <= 0;`,
        id
      );

      // 3) upsert back into main_stock (China) with stable position
      await db.runAsync(
        `INSERT INTO main_stock (id, name, quantity, position)
           VALUES (?, ?, ?, (SELECT IFNULL(MAX(position),0) + 1 FROM main_stock))
         ON CONFLICT(id) DO UPDATE
           SET quantity = main_stock.quantity + excluded.quantity;`,
        id,
        sec.name,
        qty
      );

      await db.execAsync(`COMMIT;`);
    } catch (e) {
      await db.execAsync(`ROLLBACK;`);
      throw e;
    }
  });
}

////////////////////////////////////////////////////////////////////////////////
// Pricing API
////////////////////////////////////////////////////////////////////////////////

export async function fetchPrices(): Promise<Price[]> {
  const db = await getDB();
  return db.getAllAsync<Price>(`SELECT * FROM prices;`);
}

export async function setPrice(
  article_id: number,
  price: number
): Promise<void> {
  return withWriteLock(async () => {
    const db = await getDB();
    await db.runAsync(
      `INSERT INTO prices (article_id, price)
         VALUES (?, ?)
       ON CONFLICT(article_id) DO UPDATE
         SET price = excluded.price;`,
      article_id,
      price
    );
  });
}

////////////////////////////////////////////////////////////////////////////////
// In-Memory Client (legacy)
////////////////////////////////////////////////////////////////////////////////

export async function fetchClient(): Promise<ClientItem[]> {
  const db = await getDB();
  return db.getAllAsync<ClientItem>(
    `
    SELECT
      c.article_id,
      c.quantity,
      m.name,
      IFNULL(p.price,0) AS price
    FROM client c
    JOIN main_stock m ON m.id=c.article_id
    LEFT JOIN prices p ON p.article_id=c.article_id;
    `
  );
}

export async function addToClient(
  article_id: number,
  quantity: number
): Promise<void> {
  return withWriteLock(async () => {
    const db = await getDB();
    await db.runAsync(
      `INSERT INTO client (article_id, quantity)
         VALUES (?,?)
       ON CONFLICT(article_id) DO UPDATE
         SET quantity=excluded.quantity;`,
      article_id,
      quantity
    );
  });
}

export async function clearClient(): Promise<void> {
  return withWriteLock(async () => {
    const db = await getDB();
    await db.execAsync(`DELETE FROM client;`);
  });
}

export async function fetchClientTotal(): Promise<number> {
  const db = await getDB();
  const row = await db.getFirstAsync<{ total: number }>(
    `
    SELECT SUM(c.quantity * IFNULL(p.price,0)) AS total
    FROM client c
    LEFT JOIN prices p ON p.article_id=c.article_id;
    `
  );
  return row?.total ?? 0;
}

////////////////////////////////////////////////////////////////////////////////
// Persisted Client API
////////////////////////////////////////////////////////////////////////////////

export async function saveClient(
  client: string,
  items: { article_id: number; quantity: number; price: number; name: string }[]
): Promise<void> {
  return withWriteLock(async () => {
    const db = await getDB();
    await db.execAsync(`BEGIN IMMEDIATE;`);
    try {
      await db.runAsync(
        `INSERT INTO saved_clients (client) VALUES (?);`,
        client
      );
      const row = await db.getFirstAsync<{ id: number }>(
        `SELECT last_insert_rowid() AS id;`
      );
      if (!row) throw new Error("Failed to retrieve new client ID");
      const clientId = row.id;

      for (const it of items) {
        await db.runAsync(
          `INSERT INTO saved_client_items (client_id, article_id, quantity, price, name)
             VALUES (?, ?, ?, ?, ?);`,
          clientId,
          it.article_id,
          it.quantity,
          it.price,
          it.name
        );
      }

      await db.execAsync(`COMMIT;`);
    } catch (e) {
      await db.execAsync(`ROLLBACK;`);
      throw e;
    }
  });
}

export async function fetchSavedClients(): Promise<SavedClientSummary[]> {
  const db = await getDB();
  return db.getAllAsync<SavedClientSummary>(
    `
    SELECT
      sc.id,
      sc.client,
      sc.created_at,
      IFNULL(SUM(sci.quantity * sci.price),0) AS total
    FROM saved_clients sc
    LEFT JOIN saved_client_items sci ON sci.client_id=sc.id
    GROUP BY sc.id
    ORDER BY sc.created_at DESC;
    `
  );
}

export async function fetchClientItems(
  clientId: number
): Promise<SavedClientItem[]> {
  const db = await getDB();
  return db.getAllAsync<SavedClientItem>(
    `
    SELECT
      sci.article_id,
      COALESCE(sci.name, m.name) AS name,
      sci.quantity,
      sci.price
    FROM saved_client_items sci
    LEFT JOIN main_stock m ON m.id = sci.article_id
    WHERE sci.client_id = ?;
    `,
    clientId
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
  return withWriteLock(async () => {
    const db = await getDB();
    await db.runAsync(
      `INSERT INTO clients (name, latitude, longitude) VALUES (?,?,?);`,
      name,
      latitude,
      longitude
    );
  });
}

export async function deleteClient(id: number): Promise<void> {
  return withWriteLock(async () => {
    const db = await getDB();
    await db.runAsync(`DELETE FROM clients WHERE id=?;`, id);
  });
}

export async function deleteSavedClient(clientId: number): Promise<void> {
  return withWriteLock(async () => {
    const db = await getDB();
    await db.execAsync(`BEGIN IMMEDIATE;`);
    try {
      // Get the client name before deleting
      const client = await db.getFirstAsync<{ client: string }>(
        `SELECT client FROM saved_clients WHERE id = ?;`,
        clientId
      );
      
      await db.runAsync(
        `DELETE FROM saved_client_items WHERE client_id = ?;`,
        clientId
      );
      await db.runAsync(`DELETE FROM saved_clients WHERE id = ?;`, clientId);
      
      // Also delete the corresponding map pin if it exists
      if (client) {
        await db.runAsync(
          `DELETE FROM clients WHERE name = ?;`,
          client.client
        );
      }
      
      await db.execAsync(`COMMIT;`);
    } catch (error) {
      await db.execAsync(`ROLLBACK;`);
      throw error;
    }
  });
}

////////////////////////////////////////////////////////////////////////////////
// Settings API
////////////////////////////////////////////////////////////////////////////////

export async function saveSetting(key: string, value: string): Promise<void> {
  return withWriteLock(async () => {
    const db = await getDB();
    await db.runAsync(
      `INSERT INTO settings (key, value)
         VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE
         SET value = excluded.value;`,
      key,
      value
    );
  });
}

/** Retrieve a setting value by key, or return defaultValue if not found. */
export async function getSetting(
  key: string,
  defaultValue: string
): Promise<string> {
  const db = await getDB();
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM settings WHERE key = ?;`,
    key
  );
  return row?.value ?? defaultValue;
}
