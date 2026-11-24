import assert from 'node:assert/strict';
import test from 'node:test';
import { BoundedTtlMap } from '../../server/middleware/bounded-map.mjs';
import { resolveClientIp } from '../../server/middleware/client-ip.mjs';

test('BoundedTtlMap enforces maxEntries via LRU eviction', () => {
  const map = new BoundedTtlMap({ maxEntries: 3, defaultTtlMs: 60_000 });
  map.set('a', 1);
  map.set('b', 2);
  map.set('c', 3);
  assert.equal(map.get('a'), 1); // touches 'a' as most-recently-used
  map.set('d', 4); // should evict 'b'
  assert.equal(map.size, 3);
  assert.equal(map.has('b'), false);
  assert.equal(map.get('a'), 1);
  assert.equal(map.get('c'), 3);
  assert.equal(map.get('d'), 4);
});

test('BoundedTtlMap expires entries cleanly past TTL', async () => {
  const map = new BoundedTtlMap({ maxEntries: 5, defaultTtlMs: 25 });
  map.set('short', 'ok');
  assert.equal(map.get('short'), 'ok');
  await new Promise((r) => setTimeout(r, 45));
  assert.equal(map.get('short'), undefined);
  assert.equal(map.has('short'), false);
});

test('resolveClientIp extracts leftmost public IP from x-forwarded-for behind proxy', () => {
  const ip = resolveClientIp({
    headers: { 'x-forwarded-for': '203.0.113.45, 10.0.0.1, 172.16.0.2' },
    socket: { remoteAddress: '::ffff:127.0.0.1' },
  });
  assert.equal(ip, '203.0.113.45');

  const stripped = resolveClientIp({
    headers: {},
    socket: { remoteAddress: '::ffff:192.168.1.55' },
  });
  assert.equal(stripped, '192.168.1.55');
});
