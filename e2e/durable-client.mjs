/** Local process fixture utilities; no paid services, real identities or remote writes. */
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
export async function hostProcess(t, directory, { phase = 'none', marker = '-', checkpoint = '-' } = {}) {
  const child = fork(new URL('./durable-host.mjs', import.meta.url), [directory, phase, marker, checkpoint], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), silent: true, execArgv: []
  });
  let output = '', ended = false;
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output = (output + chunk).slice(-20_000); });
  const exit = once(child, 'exit').then(value => { ended = true; return value; });
  const stop = async (hard = false) => {
    if (ended) return exit;
    if (hard || !child.connected) child.kill(hard ? 'SIGKILL' : 'SIGTERM'); else child.send({ type: 'shutdown' });
    const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
    try { return await exit; } finally { clearTimeout(timer); }
  };
  t.after(() => stop());
  const ready = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('Readiness timeout: ' + output)), 10_000);
    const onExit = () => finish(new Error('Early exit: ' + output)), onError = e => finish(e);
    const onMessage = m => { if (m?.type === 'ready') finish(null, m); };
    function finish(error, value) { clearTimeout(timer); child.off('message', onMessage); child.off('exit', onExit); child.off('error', onError); error ? reject(error) : resolve(value); }
    child.on('message', onMessage); child.once('exit', onExit); child.once('error', onError);
  });
  return { ...ready, child, exit, stop, output: () => output };
}
export async function request(url, path, body, token) {
  const r = await fetch(url + path, { signal: AbortSignal.timeout(5000), ...(body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body)
  }) });
  return { status: r.status, data: await r.json() };
}
