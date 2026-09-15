import { fork } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
export async function replicaProcess(context, directory, role, { crash = 'none', marker = '-' } = {}) {
  const child = fork(new URL('./replica-process.mjs', import.meta.url), [directory, role, crash, marker], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), silent: true, execArgv: []
  });
  let output = '', ended = false, counter = 0;
  for (const s of [child.stdout, child.stderr]) s.on('data', b => { output = (output + b).slice(-20_000); });
  const exit = once(child, 'exit').then(v => { ended = true; return v; });
  const stop = async (hard = false) => {
    if (ended) return exit;
    if (hard || !child.connected) child.kill(hard ? 'SIGKILL' : 'SIGTERM'); else child.send({ type: 'shutdown' });
    const timer = setTimeout(() => child.kill('SIGKILL'), 2000); try { return await exit; } finally { clearTimeout(timer); }
  };
  context.after(() => stop());
  const wait = (type, id) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('Harness timeout: ' + output)), 15_000);
    const onExit = () => done(new Error('Child exited: ' + output)), onError = e => done(e);
    const onMessage = m => { if (m?.type === type && (id === undefined || m.id === id)) done(null, m); };
    function done(e, result) { clearTimeout(timer); child.off('message', onMessage); child.off('exit', onExit); child.off('error', onError); e ? reject(e) : resolve(result); }
    child.on('message', onMessage); child.once('exit', onExit); child.once('error', onError);
  });
  const ready = await wait('ready');
  return { ...ready, child, exit, stop, sync: async options => { const id = ++counter, result = wait('result', id); child.send({ type: 'sync', id, options }); return result; } };
}
