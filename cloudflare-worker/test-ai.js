#!/usr/bin/env node



const prompt = process.argv[2] || 'Hello from test';
const workerUrl = process.argv[3] || process.env.WORKER_URL || 'https://chatra.modmojheh.workers.dev';

(async () => {
  try {
    console.log('Posting prompt to', workerUrl + '/ai');
    const res = await fetch(workerUrl + '/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    const text = await res.text();
    console.log('Status:', res.status);
    try { console.log('JSON:', JSON.parse(text)); } catch (e) { console.log('Body:', text); }
  } catch (e) {
    console.error('Test failed:', e);
    process.exit(1);
  }
})();
