import { createClient } from "@libsql/client";
import { config } from "dotenv";
import { randomUUID } from "crypto";

config();

class TursoDatabase {
  constructor() {
    this.client = null;
    this.tables = new Map(); // Cache tabel yang sudah dibuat
  }

  /**
   * Connect ke Turso database
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.client) return; // Sudah terkoneksi

    try {
      this.client = createClient({
        url: process.env.DATABASE_URL,
        authToken: process.env.DATABASE_AUTH_TOKEN,
      });

      console.log("✅ Connected to Turso database");
    } catch (error) {
      console.error("❌ Failed to connect to Turso:", error.message);
      throw error;
    }
  }

  /**
   * Pastikan tabel ada, kalau belum ada buat otomatis
   * @param {string} tableName - Nama tabel
   * @returns {Promise<void>}
   */
  async ensureTable(tableName) {
    // Kalau tabel sudah pernah dicek/dibuat, skip
    if (this.tables.has(tableName)) return;

    await this.connect();

    try {
      // Buat tabel kalau belum ada
      await this.client.execute(`
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id TEXT PRIMARY KEY,
          data TEXT NOT NULL
        )
      `);

      this.tables.set(tableName, true);
      console.log(`✅ Table "${tableName}" ready`);
    } catch (error) {
      console.error(`❌ Failed to create table "${tableName}":`, error.message);
      throw error;
    }
  }

  /**
   * Get table instance untuk query
   * @param {string} tableName - Nama tabel
   * @returns {TableAPI}
   */
  get(tableName) {
    return new TableAPI(this, tableName);
  }

  /**
   * List semua tabel yang ada di database
   * @returns {Promise<string[]>}
   */
  async listTables() {
    await this.connect();

    try {
      const result = await this.client.execute(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `);

      return result.rows.map((row) => row.name);
    } catch (error) {
      console.error("❌ Failed to list tables:", error.message);
      return [];
    }
  }

  /**
   * Drop/hapus tabel dari database
   * @param {string} tableName - Nama tabel yang mau dihapus
   * @returns {Promise<boolean>}
   */
  async drop(tableName) {
    await this.connect();

    try {
      await this.client.execute(`DROP TABLE IF EXISTS ${tableName}`);
      this.tables.delete(tableName);
      console.log(`✅ Table "${tableName}" dropped`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to drop table "${tableName}":`, error.message);
      return false;
    }
  }

  /**
   * Close koneksi database
   * @returns {Promise<void>}
   */
  async close() {
    if (this.client) {
      await this.client.close();
      this.client = null;
      console.log("✅ Database connection closed");
    }
  }
}

/**
 * Table API - Interface untuk operasi CRUD pada tabel
 */
class TableAPI {
  constructor(database, tableName) {
    this.db = database;
    this.tableName = tableName;
  }

  /**
   * Set/Insert/Update data ke tabel
   * @param {string} keyField - Nama field untuk key (biasanya "id")
   * @param {string|null} keyValue - Value dari key, kalau null akan generate UUID
   * @param {object} data - Data object yang mau disimpan
   * @returns {Promise<string>} - ID dari data yang disimpan
   */
  async set(keyField, keyValue = null, data = {}) {
    await this.db.ensureTable(this.tableName);

    // Kalau keyValue null, generate UUID
    const id = keyValue || randomUUID();

    // Kalau data tidak punya field key, tambahin
    if (!data[keyField]) {
      data[keyField] = id;
    }

    try {
      // Serialize data jadi JSON string
      const jsonData = JSON.stringify(data);

      // Insert or replace (upsert)
      await this.db.client.execute({
        sql: `INSERT OR REPLACE INTO ${this.tableName} (id, data) VALUES (?, ?)`,
        args: [id, jsonData],
      });

      return id;
    } catch (error) {
      console.error(`❌ Failed to set data in "${this.tableName}":`, error.message);
      throw error;
    }
  }

  /**
   * Get data dari tabel berdasarkan key
   * @param {string} keyField - Nama field untuk key
   * @param {string} keyValue - Value dari key
   * @returns {Promise<object|null>}
   */
  async get(keyField, keyValue) {
    await this.db.ensureTable(this.tableName);

    try {
      const result = await this.db.client.execute({
        sql: `SELECT data FROM ${this.tableName} WHERE id = ?`,
        args: [keyValue],
      });

      if (result.rows.length === 0) return null;

      // Parse JSON string jadi object
      return JSON.parse(result.rows[0].data);
    } catch (error) {
      console.error(`❌ Failed to get data from "${this.tableName}":`, error.message);
      return null;
    }
  }

  /**
   * Get semua data dari tabel
   * @returns {Promise<object[]>}
   */
  async all() {
    await this.db.ensureTable(this.tableName);

    try {
      const result = await this.db.client.execute(
        `SELECT data FROM ${this.tableName}`
      );

      // Parse semua data JSON jadi array of objects
      return result.rows.map((row) => JSON.parse(row.data));
    } catch (error) {
      console.error(`❌ Failed to get all data from "${this.tableName}":`, error.message);
      return [];
    }
  }

  /**
   * Delete data dari tabel
   * @param {string} keyField - Nama field untuk key
   * @param {string} keyValue - Value dari key
   * @returns {Promise<boolean>}
   */
  async delete(keyField, keyValue) {
    await this.db.ensureTable(this.tableName);

    try {
      await this.db.client.execute({
        sql: `DELETE FROM ${this.tableName} WHERE id = ?`,
        args: [keyValue],
      });

      return true;
    } catch (error) {
      console.error(`❌ Failed to delete data from "${this.tableName}":`, error.message);
      return false;
    }
  }

  /**
   * Count total data di tabel
   * @returns {Promise<number>}
   */
  async count() {
    await this.db.ensureTable(this.tableName);

    try {
      const result = await this.db.client.execute(
        `SELECT COUNT(*) as total FROM ${this.tableName}`
      );

      return result.rows[0].total;
    } catch (error) {
      console.error(`❌ Failed to count data in "${this.tableName}":`, error.message);
      return 0;
    }
  }

  /**
   * Clear semua data di tabel (tanpa hapus tabelnya)
   * @returns {Promise<boolean>}
   */
  async clear() {
    await this.db.ensureTable(this.tableName);

    try {
      await this.db.client.execute(`DELETE FROM ${this.tableName}`);
      console.log(`✅ Table "${this.tableName}" cleared`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to clear table "${this.tableName}":`, error.message);
      return false;
    }
  }
}

export const db = new TursoDatabase();