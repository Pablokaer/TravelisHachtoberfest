import { assertEquals } from 'jsr:@std/assert@1';

import { handler } from './index.ts';

Deno.test('health returns ok', async () => {
  const res = handler(new Request('http://localhost/health'));
  assertEquals(res.status, 200);
  assertEquals((await res.json()).ok, true);
});

Deno.test('health answers CORS preflight', () => {
  const res = handler(new Request('http://localhost/health', { method: 'OPTIONS' }));
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), '*');
});
