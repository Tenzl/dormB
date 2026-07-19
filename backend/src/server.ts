import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const config=loadConfig();const app=await buildApp(config);
try{await app.listen({host:'0.0.0.0',port:config.port});console.log(`Dormitory API listening on http://localhost:${config.port}`);}catch(error){app.log.error(error);process.exit(1);}

