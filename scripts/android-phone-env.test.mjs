// Run: node --test scripts/
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildPathProblem, phoneEnv, pickLanIp } from './android-phone-env.mjs';

const nic = (address, { internal = false, family = 'IPv4' } = {}) => ({
  address,
  internal,
  family,
});

test('pickLanIp prefers a home-network address over virtual adapters', () => {
  const interfaces = {
    'VirtualBox Host-Only': [nic('192.168.56.1')],
    'vEthernet (WSL)': [nic('172.31.0.1')],
    'Wi-Fi': [nic('192.168.1.2'), nic('fe80::1', { family: 'IPv6' })],
    Loopback: [nic('127.0.0.1', { internal: true })],
  };
  assert.equal(pickLanIp(interfaces), '192.168.1.2');
});

test('pickLanIp fails with the adapters it saw when no private IPv4 exists', () => {
  assert.throws(() => pickLanIp({ Loopback: [nic('127.0.0.1', { internal: true })] }), /Loopback/);
});

test('phoneEnv points Supabase and the city builder at the PC, in local mode', () => {
  const env = phoneEnv({ host: '192.168.1.2', anonKey: 'anon-123' });
  assert.equal(env.EXPO_PUBLIC_SUPABASE_URL, 'http://192.168.1.2:54321');
  assert.equal(env.EXPO_PUBLIC_CITY_BUILDER_URL, 'http://192.168.1.2:8787');
  assert.equal(env.EXPO_PUBLIC_SUPABASE_ANON_KEY, 'anon-123');
  assert.equal(env.EXPO_PUBLIC_LOCAL_MODE, 'true');
});

test('phoneEnv refuses an empty anon key, naming where to find it', () => {
  assert.throws(
    () => phoneEnv({ host: '192.168.1.2', anonKey: '' }),
    /EXPO_PUBLIC_SUPABASE_ANON_KEY/,
  );
});

test('buildPathProblem rejects a checkout path with parentheses, naming it', () => {
  const problem = buildPathProblem('C:/Users/Pablo/travelist-main(1)/repo');
  assert.match(problem, /travelist-main\(1\)/);
  assert.match(problem, /parentheses/);
});

test('buildPathProblem accepts a plain path', () => {
  assert.equal(buildPathProblem('C:/wf-apk'), null);
});
