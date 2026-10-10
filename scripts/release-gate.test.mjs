// Run: node --test scripts/
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { releaseVerdict } from './release-gate.mjs';

const SHA = 'abc123';
const REQUIRED = ['CI', 'Security'];

function run(name, conclusion, { sha = SHA, status = 'completed', id = 1 } = {}) {
  return { name, head_sha: sha, status, conclusion, id };
}

test('ready when every required workflow passed on the tip of dev', () => {
  const runs = [run('CI', 'success'), run('Security', 'success')];
  const verdict = releaseVerdict({ runs, required: REQUIRED, sha: SHA, devHead: SHA });
  assert.deepEqual(verdict, { ready: true, reason: 'CI, Security passed on abc123' });
});

test('not ready while a required workflow is still running', () => {
  const runs = [run('CI', 'success'), run('Security', null, { status: 'in_progress' })];
  const verdict = releaseVerdict({ runs, required: REQUIRED, sha: SHA, devHead: SHA });
  assert.equal(verdict.ready, false);
  assert.match(verdict.reason, /Security is in_progress/);
});

test('not ready when a required workflow failed', () => {
  const runs = [run('CI', 'failure'), run('Security', 'success')];
  const verdict = releaseVerdict({ runs, required: REQUIRED, sha: SHA, devHead: SHA });
  assert.equal(verdict.ready, false);
  assert.match(verdict.reason, /CI concluded failure/);
});

test('not ready when a required workflow never ran on the commit', () => {
  const verdict = releaseVerdict({
    runs: [run('CI', 'success')],
    required: REQUIRED,
    sha: SHA,
    devHead: SHA,
  });
  assert.equal(verdict.ready, false);
  assert.match(verdict.reason, /Security has no run on abc123/);
});

test('the latest run of a workflow wins (a re-run after a flaky failure)', () => {
  const runs = [
    run('CI', 'failure', { id: 1 }),
    run('CI', 'success', { id: 2 }),
    run('Security', 'success'),
  ];
  assert.equal(releaseVerdict({ runs, required: REQUIRED, sha: SHA, devHead: SHA }).ready, true);
});

test('runs of other commits are ignored', () => {
  const runs = [run('CI', 'success', { sha: 'other' }), run('Security', 'success')];
  assert.equal(releaseVerdict({ runs, required: REQUIRED, sha: SHA, devHead: SHA }).ready, false);
});

test('not ready when dev has moved on: the newer commit is promoted instead', () => {
  const runs = [run('CI', 'success'), run('Security', 'success')];
  const verdict = releaseVerdict({ runs, required: REQUIRED, sha: SHA, devHead: 'def456' });
  assert.equal(verdict.ready, false);
  assert.match(verdict.reason, /dev is now at def456/);
});
