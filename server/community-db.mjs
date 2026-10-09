import Database from 'better-sqlite3';
import {readFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {makeCommunity} from '../lib/community/service.mjs';
const path=process.env.DATABASE_PATH||'./data/truethrills.db';mkdirSync(dirname(path),{recursive:true});
const db=new Database(path);db.pragma('foreign_keys=ON');db.pragma('busy_timeout=5000');
try{db.exec(readFileSync(new URL('../lib/community/schema.sql',import.meta.url),'utf8'));if(process.argv.includes('--prune'))makeCommunity({db,rateSecret:process.env.COMMUNITY_RATE_SECRET}).prune();console.log('Community database ready');}finally{db.close();}
