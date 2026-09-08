import { createServer } from 'vite';
import http from 'http';
import express from 'express';

async function test() {
  const app = express();
  const server = http.createServer(app);
  try {
    const vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: { server }
      }
    });
    console.log("Successfully bound Vite to existing HTTP server");
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
test();
