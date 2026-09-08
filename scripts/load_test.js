import http from 'http';

function sendRequest(i) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ prompt: `Load test ${i}` });
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/ai/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'X-Request-Id': `req-${i}`
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
         resolve({ i, status: res.statusCode, body });
      });
    });
    req.on('error', (e) => resolve({ i, error: e.message }));
    req.write(data);
    req.end();
  });
}

async function runTest(concurrency) {
  console.log(`\n--- CONCURRENCY TEST: ${concurrency} REQUESTS ---`);
  const promises = [];
  const start = Date.now();
  for (let i = 0; i < concurrency; i++) {
    promises.push(sendRequest(i));
  }
  const results = await Promise.all(promises);
  const duration = Date.now() - start;
  
  const statusCounts = {};
  for (const r of results) {
     const s = r.status || 'ERROR';
     statusCounts[s] = (statusCounts[s] || 0) + 1;
  }
  console.log(`Duration: ${duration}ms`);
  console.log('Status counts:', statusCounts);
}

async function main() {
  await runTest(1);
  await runTest(3);
  await runTest(10);
  await runTest(25);
  // Give circuit breaker some time to cool down if hit
  console.log("Waiting 12 seconds for potential cooldowns to expire...");
  await new Promise(r => setTimeout(r, 12000));
  await runTest(50);
}

main().catch(console.error);
