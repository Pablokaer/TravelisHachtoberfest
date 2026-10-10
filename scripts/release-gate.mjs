#!/usr/bin/env node
// Release gate (D-075): may this commit of dev be promoted to main? Only when every required
// workflow (CI, Security) passed on it as a push to dev, and it is still dev's tip — an older
// commit is never promoted over a newer one. Used by .github/workflows/promote.yml.
//
// Usage (GitHub Actions; needs `gh` authenticated through GH_TOKEN):
//   node scripts/release-gate.mjs <sha> CI Security
// Prints the reason, writes ready=true|false to $GITHUB_OUTPUT, always exits 0 when it could ask.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * @typedef {{ name: string, head_sha: string, status: string, conclusion: string | null, id: number }} WorkflowRun
 * @typedef {{ ready: boolean, reason: string }} ReleaseVerdict
 */

/**
 * Decides whether `sha` can be promoted.
 * @param {{ runs: WorkflowRun[], required: string[], sha: string, devHead: string }} input
 * @returns {ReleaseVerdict}
 * @example releaseVerdict({ runs, required: ['CI', 'Security'], sha, devHead }) // { ready: true, … }
 */
export function releaseVerdict({ runs, required, sha, devHead }) {
  if (devHead !== sha)
    return { ready: false, reason: `dev is now at ${devHead}; ${sha} is not promoted` };
  const problems = required.map((name) => workflowProblem(latestRun(runs, name, sha), name, sha));
  const blocking = problems.filter(Boolean);
  if (blocking.length > 0) return { ready: false, reason: blocking.join('; ') };
  return { ready: true, reason: `${required.join(', ')} passed on ${sha}` };
}

/** The newest run of a workflow on a commit: a re-run supersedes the failure before it. */
function latestRun(runs, name, sha) {
  const matching = runs.filter((run) => run.name === name && run.head_sha === sha);
  return matching.sort((a, b) => b.id - a.id)[0];
}

/** Why a workflow blocks the release, or null when it passed. */
function workflowProblem(run, name, sha) {
  if (!run) return `${name} has no run on ${sha}`;
  if (run.status !== 'completed') return `${name} is ${run.status}`;
  if (run.conclusion !== 'success') return `${name} concluded ${run.conclusion}`;
  return null;
}

function ghJson(path) {
  return JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8' }));
}

function main([sha, ...required]) {
  if (!sha || required.length === 0) {
    throw new Error(
      `Usage: release-gate.mjs <sha> <workflow>... (got sha=${sha}, workflows=${required})`,
    );
  }
  const repo = process.env.GITHUB_REPOSITORY;
  const { workflow_runs: runs } = ghJson(
    `repos/${repo}/actions/runs?head_sha=${sha}&event=push&branch=dev&per_page=100`,
  );
  const devHead = ghJson(`repos/${repo}/branches/dev`).commit.sha;
  const verdict = releaseVerdict({ runs, required, sha, devHead });
  console.log(verdict.reason);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `ready=${verdict.ready}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
