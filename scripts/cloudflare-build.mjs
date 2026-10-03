import {spawnSync} from 'node:child_process';

const env = {...process.env};
const nested = process.env.PUMPCLIP_OPENNEXT_NESTED === '1';

env.PUMPCLIP_OPENNEXT_NESTED = '1';

const run = (command, args) => {
  const result = spawnSync(command, args, {stdio: 'inherit', env});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run('npx', ['next', 'build']);

if (!nested) {
  run('npx', ['opennextjs-cloudflare', 'build', '--skipNextBuild']);
}
