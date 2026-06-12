const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGO_DB || 'kaeli_system';

let client = null;
let db = null;

async function connect() {
  if (db) return db;
  client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db(DB_NAME);
  console.log('[MongoDB] Conectado a', DB_NAME);
  return db;
}

class MongoDatabase {
  constructor(collectionName) {
    this.collectionName = collectionName;
    this.cache = {};
    this.dirty = false;
    this.initialized = false;
  }

  async init() {
    const database = await connect();
    this.collection = database.collection(this.collectionName);
    const docs = await this.collection.find({}).toArray();
    for (const doc of docs) {
      this.cache[doc._key] = doc.value;
    }
    this.initialized = true;
    console.log(`[MongoDB] "${this.collectionName}" carregado (${Object.keys(this.cache).length} chaves)`);
  }

  get(key) {
    if (!this.initialized) return undefined;
    return this.cache[key];
  }

  set(key, value) {
    this.cache[key] = value;
    this.dirty = true;
    this._scheduleSave();
    return true;
  }

  has(key) {
    if (!this.initialized) return false;
    return key in this.cache;
  }

  delete(key) {
    delete this.cache[key];
    this.dirty = true;
    this._scheduleSave();
    return true;
  }

  push(key, value) {
    const arr = this.cache[key] || (this.cache[key] = []);
    arr.push(value);
    this.dirty = true;
    this._scheduleSave();
    return arr;
  }

  pull(key, value) {
    const arr = this.cache[key];
    if (!arr) return;
    const idx = typeof value === 'function' ? arr.findIndex(value) : arr.indexOf(value);
    if (idx !== -1) arr.splice(idx, 1);
    this.dirty = true;
    this._scheduleSave();
    return arr;
  }

  add(key, amount) {
    const val = parseFloat(this.cache[key] || 0);
    this.cache[key] = val + amount;
    this.dirty = true;
    this._scheduleSave();
    return this.cache[key];
  }

  subtract(key, amount) {
    return this.add(key, -amount);
  }

  all() {
    return Object.entries(this.cache).map(([id, data]) => ({ ID: id, data }));
  }

  _saveTimeout = null;
  _scheduleSave() {
    if (this._saveTimeout) return;
    this._saveTimeout = setTimeout(() => this._flush(), 500);
  }

  async _flush() {
    this._saveTimeout = null;
    if (!this.dirty || !this.collection) return;
    this.dirty = false;

    try {
      const bulkOps = Object.entries(this.cache).map(([key, value]) => ({
        updateOne: {
          filter: { _key: key },
          update: { $set: { _key: key, value } },
          upsert: true
        }
      }));
      if (bulkOps.length) await this.collection.bulkWrite(bulkOps);
    } catch (err) {
      console.error(`[MongoDB] Erro ao salvar "${this.collectionName}":`, err.message);
    }
  }

  async save() {
    await this._flush();
  }
}

async function initAll(collections) {
  const instances = {};
  for (const name of collections) {
    const inst = new MongoDatabase(name);
    await inst.init();
    instances[name] = inst;
  }
  return instances;
}

process.on('SIGINT', async () => {
  console.log('\n[MongoDB] Salvando dados...');
  if (client) await client.close();
  process.exit(0);
});

module.exports = { MongoDatabase, connect, initAll };
