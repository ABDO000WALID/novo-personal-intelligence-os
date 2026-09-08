const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Replace the entire Vite initialization block with the correct HTTP server binding
const newViteBlock = `
  const server = http.createServer(app);

  let vite = null;
  if (process.env.NODE_ENV !== 'production') {
    try {
      vite = await createViteServer({
        server: { 
          middlewareMode: true,
          hmr: { server }
        },
        appType: 'spa',
      });
      app.use((req, res, next) => {
          vite.middlewares(req, res, next);
      });
    } catch (err) {
      console.error('Failed to create Vite server:', err);
    }
  } else {
    // If production or HMR disabled, serve static directly
    const distPath = path.join(process.cwd(), 'dist');
    if (!fs.existsSync(path.join(distPath, 'index.html'))) {
      console.error('[SERVER ERROR] Production build not found. Missing dist/index.html. Did you run npm run build?');
      process.exit(1);
    }
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(\`Server running on http://0.0.0.0:\${PORT}\`);
  });

  server.on('error', (err) => {
     console.error('[SERVER ERROR]', err);
  });
`;

code = code.replace(/let vite = null;[\s\S]*?server\.on\('error', \(err\) => \{/m, newViteBlock + "\n  //");

// Ensure http is imported
if (!code.includes("import http from 'http';")) {
  code = code.replace("import express from 'express';", "import express from 'express';\nimport http from 'http';");
}

fs.writeFileSync('server.ts', code);
