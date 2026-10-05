import {spawn} from 'node:child_process';

const children=[];
function start(command,args){const child=spawn(command,args,{stdio:'inherit',env:process.env});children.push(child);return child;}
async function run(command,args){return new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:'inherit',env:process.env});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`${command} exited with ${code}`)));});}
async function main(){
  if(process.env.DATABASE_URL){
    await run(process.execPath,['scripts/migrate.mjs']);
    start(process.execPath,['scripts/native-worker.mjs']);
    start(process.execPath,['scripts/channel-worker.mjs']);
  } else console.warn('[render-entrypoint] DATABASE_URL is not configured; workers and migrations are disabled.');
  const server=start(process.execPath,['server.js']);
  const shutdown=signal=>{for(const child of children)child.kill(signal);};
  process.on('SIGTERM',()=>shutdown('SIGTERM')); process.on('SIGINT',()=>shutdown('SIGINT'));
  server.on('exit',code=>{shutdown('SIGTERM');process.exit(code??1);});
}
main().catch(error=>{console.error('[render-entrypoint] startup failed',error);process.exit(1);});
