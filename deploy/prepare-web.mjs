import {copyFile,writeFile} from 'node:fs/promises';

const url=process.env.KALMAR_ARENA_URL||'wss://arena.bjarby.com/ws';
if(new URL(url).protocol!=='wss:')throw new Error('The published arena URL must use wss.');
await writeFile(new URL('../dist/arena-config.json',import.meta.url),JSON.stringify({url},null,2)+'\n');
await copyFile(new URL('web.htaccess',import.meta.url),new URL('../dist/.htaccess',import.meta.url));
console.log(`Publication prepared: ${url}`);
