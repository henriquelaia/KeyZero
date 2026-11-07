/** In-memory stand-in for backend/db.js (sem Mongo real). */
function makeCursor(rows) {
  return {
    toArray: async () => rows.slice(),
    sort: () => makeCursor(rows),
  };
}

function createMockDb() {
  const store = {
    users: [],
    passwords: [],
  };

  return {
    store,
    queryFallback: async (collection, operation, args) => {
      const coll = store[collection];
      if (!coll) throw new Error(`unknown collection ${collection}`);
      if (operation === 'find') {
        const [query = {}] = args;
        const rows = coll.filter((doc) => matchQuery(doc, query));
        return makeCursor(rows);
      }
      if (operation === 'findOne') {
        const [query = {}] = args;
        return coll.find((doc) => matchQuery(doc, query)) || null;
      }
      if (operation === 'insertOne') {
        const [doc] = args;
        coll.push({ ...doc });
        return { insertedId: doc.id };
      }
      if (operation === 'updateOne') {
        const [query, update] = args;
        const doc = coll.find((d) => matchQuery(d, query));
        if (!doc) return { matchedCount: 0 };
        if (update.$set) Object.assign(doc, update.$set);
        return { matchedCount: 1 };
      }
      if (operation === 'deleteOne') {
        const [query] = args;
        const idx = coll.findIndex((d) => matchQuery(d, query));
        if (idx === -1) return { deletedCount: 0 };
        coll.splice(idx, 1);
        return { deletedCount: 1 };
      }
      throw new Error(`unsupported op ${operation}`);
    },
  };
}

function matchQuery(doc, query) {
  for (const [k, v] of Object.entries(query)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && v.$ne !== undefined) {
      if (doc[k] === v.$ne) return false;
      continue;
    }
    if (doc[k] !== v) return false;
  }
  return true;
}

function installMockDb(mock) {
  const dbPath = require.resolve('../../db');
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: mock,
  };
  // Rotas já carregadas têm de ser limpas.
  for (const key of Object.keys(require.cache)) {
    if (key.includes(`${require('path').sep}routes${require('path').sep}`)) {
      delete require.cache[key];
    }
  }
}

module.exports = { createMockDb, installMockDb };
