import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import { CircuitBreaker, isUpstreamOutage } from './breaker.ts';
import { FakeClock } from './fake-clock.ts';
import { HttpError } from './http.ts';

const URL_ = 'https://api.openrouteservice.org/optimization';

Deno.test('breaker: a tripped name stays open for the cool-down, then closes', () => {
  const clock = new FakeClock();
  const breaker = new CircuitBreaker(60, clock.now);
  assertEquals(breaker.isOpen('ors:optimize'), false);
  breaker.trip('ors:optimize');
  assertEquals(breaker.isOpen('ors:optimize'), true);
  assertEquals(breaker.isOpen('ors:directions'), false, 'names are independent');
  clock.advance(59);
  assertEquals(breaker.isOpen('ors:optimize'), true);
  clock.advance(1);
  assertEquals(breaker.isOpen('ors:optimize'), false);
});

Deno.test('breaker: run skips an open name and trips only on the given failures', async () => {
  const breaker = new CircuitBreaker(60, new FakeClock().now);
  let calls = 0;
  const failing = (err: Error) => () => {
    calls++;
    return Promise.reject(err);
  };
  await assertRejects(() => breaker.run('a', failing(new Error('bad answer')), isUpstreamOutage));
  assertEquals(breaker.isOpen('a'), false, 'a malformed answer is not an outage');
  const busy = new HttpError(URL_, 503, 'busy');
  await assertRejects(() => breaker.run('a', failing(busy), isUpstreamOutage), HttpError);
  await assertRejects(() => breaker.run('a', failing(busy), isUpstreamOutage), Error, 'cooling');
  assertEquals(calls, 2, 'the open name is not called');
});

Deno.test('isUpstreamOutage: 429, 5xx and timeouts; not 4xx or other errors', () => {
  assertEquals(isUpstreamOutage(new HttpError(URL_, 429, '')), true);
  assertEquals(isUpstreamOutage(new HttpError(URL_, 502, '')), true);
  assertEquals(isUpstreamOutage(new DOMException('timed out', 'TimeoutError')), true);
  assertEquals(isUpstreamOutage(new HttpError(URL_, 403, 'Quota exceeded')), false);
  assertEquals(isUpstreamOutage(new Error('ORS directions returned no route')), false);
});
