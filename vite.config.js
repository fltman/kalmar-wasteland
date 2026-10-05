import {defineConfig} from 'vite';
import {attachArenaRelay} from './server/index.mjs';
export default defineConfig({base:'./',server:{host:'0.0.0.0',port:5220},plugins:[{name:'arena-relay',configureServer(server){const relay=attachArenaRelay(server.httpServer,{path:'/arena/ws'});server.httpServer.once('close',()=>relay.close());}}]});
