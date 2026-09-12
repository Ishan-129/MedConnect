import assert from 'node:assert';

const BASE_URL = 'http://localhost:3001';

async function request(path, opts = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function runTests() {
  console.log('--- Testing Emergency QR Pass Flow ---');

  // 1. Check network info endpoint
  const net = await request('/api/network-info');
  assert(net.ok, 'network-info returns 200');
  assert(net.data.baseUrl, 'baseUrl present');
  console.log('✅ 1. Network Info baseUrl verified:', net.data.baseUrl);

  // 2. Fetch active emergency requests
  const reqs = await request('/api/emergency/requests');
  assert(reqs.ok, 'emergency requests returns 200');
  const targetReq = reqs.data.requests?.[0];
  assert(targetReq, 'At least one request found');
  console.log('✅ 2. Target Emergency Request ID:', targetReq.id);

  // 3. Verify dispatch pass via GET /api/emergency/dispatch
  const dispGet = await request(`/api/emergency/dispatch?id=${targetReq.id}`);
  assert(dispGet.ok, 'dispatch endpoint returns 200');
  assert(dispGet.data.success, 'dispatch success true');
  console.log('✅ 3. Dispatch Status verified:', dispGet.data.dispatch?.status);

  // 4. Verify step 1: Pickup via /api/qr/check-in
  const pickupRes = await request('/api/qr/check-in', {
    method: 'POST',
    body: JSON.stringify({
      type: 'emergency_dispatch',
      dispatch_id: targetReq.id,
      action: 'pickup',
    }),
  });
  assert(pickupRes.ok, 'pickup returns 200');
  console.log('✅ 4. Step 1 (Pickup Handover) Verified:', pickupRes.data.action_performed || pickupRes.data.status);

  // 5. Verify step 2: Delivery via /api/qr/check-in
  const deliveryRes = await request('/api/qr/check-in', {
    method: 'POST',
    body: JSON.stringify({
      type: 'emergency_dispatch',
      dispatch_id: targetReq.id,
      action: 'check_in',
    }),
  });
  assert(deliveryRes.ok, 'delivery returns 200');
  console.log('✅ 5. Step 2 (ER Intake Delivery) Verified:', deliveryRes.data.action_performed || deliveryRes.data.status);

  console.log('🎉 ALL EMERGENCY QR PASS TESTS PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
