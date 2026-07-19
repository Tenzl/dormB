import { loadConfig } from './config.js';
import { createDb, migrateDb } from './db/index.js';
import { resetSeed } from './seed.js';

const {databaseUrl}=loadConfig();const {db,pool}=createDb(databaseUrl);await migrateDb(pool);await resetSeed(db);await pool.end();console.log('Seeded demo state restored.');
