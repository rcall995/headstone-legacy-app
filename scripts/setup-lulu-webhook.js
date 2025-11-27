/**
 * One-time script to register webhook with Lulu Direct API
 * Run with: node scripts/setup-lulu-webhook.js
 */

import 'dotenv/config';

const LULU_CLIENT_KEY = process.env.LULU_CLIENT_KEY;
const LULU_CLIENT_SECRET = process.env.LULU_CLIENT_SECRET;
const LULU_API_BASE = process.env.LULU_API_BASE || 'https://api.lulu.com';

const WEBHOOK_URL = 'https://www.headstonelegacy.com/api/webhooks/lulu';

async function getAccessToken() {
  const credentials = Buffer.from(`${LULU_CLIENT_KEY}:${LULU_CLIENT_SECRET}`).toString('base64');

  const response = await fetch(`${LULU_API_BASE}/auth/realms/glasstree/protocol/openid-connect/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!response.ok) {
    throw new Error(`Auth failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function createWebhook() {
  console.log('Getting access token...');
  const token = await getAccessToken();
  console.log('✓ Got access token');

  console.log(`\nCreating webhook for: ${WEBHOOK_URL}`);

  const response = await fetch(`${LULU_API_BASE}/webhooks/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url: WEBHOOK_URL,
      topics: ['PRINT_JOB_STATUS_CHANGED']
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (errorText.includes('already exists') || response.status === 409) {
      console.log('⚠ Webhook already exists for this URL');
      return;
    }
    throw new Error(`Failed to create webhook: ${response.status} ${errorText}`);
  }

  const webhook = await response.json();
  console.log('✓ Webhook created successfully!');
  console.log('  ID:', webhook.id);
  console.log('  URL:', webhook.url);
  console.log('  Topics:', webhook.topics);
  console.log('  Active:', webhook.is_active);
}

async function listWebhooks() {
  const token = await getAccessToken();

  const response = await fetch(`${LULU_API_BASE}/webhooks/`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to list webhooks: ${response.status}`);
  }

  const webhooks = await response.json();
  console.log('\nExisting webhooks:');
  if (webhooks.results?.length > 0) {
    webhooks.results.forEach(wh => {
      console.log(`  - ${wh.url} (${wh.is_active ? 'active' : 'inactive'})`);
    });
  } else {
    console.log('  (none)');
  }
}

async function main() {
  try {
    await listWebhooks();
    await createWebhook();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
