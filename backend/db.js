const { MongoClient } = require('mongodb');

// O MongoDB URI pode vir das vars de ambiente ou localhost (sem pass) se local
const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const dbName = process.env.DB_NAME || 'keyzero';

const client = new MongoClient(uri);
let dbInstance;

async function connectDB() {
  try {
    await client.connect();
    dbInstance = client.db(dbName);
    console.log('✅ MongoDB ligado com sucesso');

    // Criar índices únicos
    await dbInstance.collection('users').createIndex({ email: 1 }, { unique: true });
    await dbInstance.collection('users').createIndex({ salt: 1 }, { unique: true });
    
  } catch (err) {
    console.error('❌ Erro de ligação à BD:', err.message);
  }
}

connectDB();

// Wrapper simplificado (adapter) para aproveitar a sintaxe anterior tanto quanto possível
// Note-se que isto serve essencialmente como fachada
const db = {
  getCollection(collName) {
    if (!dbInstance) throw new Error('Database not initialized');
    return dbInstance.collection(collName);
  },
  
  // Função helper para manter o mínimo de alterações possível na aplicação core que possa usar SQL direto
  // Retorna "rows" simulando o mysql
  async queryFallback(collection, operation, args) {
     const coll = this.getCollection(collection);
     return await coll[operation](...args);
  }
};

module.exports = db;
