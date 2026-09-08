import { createServer } from 'vite';
async function test() {
  const vite = await createServer({ server: { middlewareMode: true } });
  console.log('vite.ws keys:', Object.keys(vite.ws));
  console.log('vite.ws typeof upgrade:', typeof vite.ws.upgrade);
  process.exit(0);
}
test();
