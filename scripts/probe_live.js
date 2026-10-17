const https = require('https');

const urls = [
  'https://salmo.dev/api/health',
  'https://salmo.dev/api/daily-picks',
  'https://handicaplab-production-129269713730.asia-southeast2.run.app/api/health',
  'https://handicaplab-production-129269713730.asia-southeast2.run.app/api/providers'
];

async function fetchUrl(u) {
  return new Promise((resolve) => {
    https.get(u, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ url: u, status: res.statusCode, data });
      });
    }).on('error', (err) => {
      resolve({ url: u, status: 0, data: err.message });
    });
  });
}

(async () => {
  for (const u of urls) {
    const res = await fetchUrl(u);
    console.log(`=== ${res.url} (HTTP ${res.status}) ===`);
    try {
      console.log(JSON.stringify(JSON.parse(res.data), null, 2));
    } catch {
      console.log(res.data.slice(0, 300));
    }
  }
})();
