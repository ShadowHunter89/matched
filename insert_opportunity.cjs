const https = require('https');

const userId = 'dfa244b1-60a4-4053-92cd-a92fe3d1327a';
const query = `INSERT INTO opportunities (client_id, title, description, required_skills, budget_min, budget_max, hours_per_week, remote_option) VALUES ('${userId}', 'Fractional CTO for AI Startup', 'We need a fractional CTO to lead engineering at our Series A AI startup. Must have experience with Node.js, React, and team leadership.', ARRAY['Engineering Leadership','React','Node.js'], 15000, 20000, 20, 'remote_only') RETURNING id;`;

const body = JSON.stringify({ query });

const options = {
  hostname: 'api.supabase.com',
  path: '/v1/projects/knxheermpthrmjxvhopx/database/query',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer sbp_c2a95b71755bc94fb36aac1bcc3a7d2b1e6b9c1e',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('Response:', data);
    try {
      const parsed = JSON.parse(data);
      if (parsed && parsed[0] && parsed[0].id) {
        console.log('OPPORTUNITY_ID:', parsed[0].id);
      }
    } catch(e) {
      console.log('Parse error:', e.message);
    }
  });
});

req.on('error', (e) => console.error('Error:', e.message));
req.write(body);
req.end();
