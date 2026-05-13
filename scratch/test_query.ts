import http from 'http';

const postData = JSON.stringify({
  provider: 'anthropic',
  prompt: 'Test prompt',
  context: 'product-analysis'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/ai/query',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(postData);
req.end();
