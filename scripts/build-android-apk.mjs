#!/usr/bin/env node
// Builds an installable Android APK of the app on this machine, pointed at this PC's local
// stack (Supabase :54321, city builder :8787) over the Wi-Fi, for a phone on the same network.
//   node scripts/build-android-apk.mjs [--host <pc-ip>] [--skip-prebuild]
// Output: dist/travelist.apk. See README → "Android on your phone".
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPathProblem, phoneEnv, pickLanIp } from './android-phone-env.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const mobile = join(root, 'apps/mobile');
const androidDir = join(mobile, 'android');
const releaseApk = join(androidDir, 'app/build/outputs/apk/release/app-release.apk');
const outApk = join(root, 'dist/travelist.apk');

function readDotenv(file) {
  if (!existsSync(file)) throw new Error(`${file} not found: copy .env.example to .env first.`);
  const pairs = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]);
  return Object.fromEntries(pairs);
}

function argValue(flag) {
  const at = process.argv.indexOf(flag);
  return at === -1 ? undefined : process.argv[at + 1];
}

function androidSdkPath() {
  const fromEnv = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (fromEnv) return fromEnv;
  const windowsDefault = join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk');
  if (existsSync(windowsDefault)) return windowsDefault;
  throw new Error('Android SDK not found: install Android Studio or set ANDROID_HOME.');
}

function run(command, args, cwd, env, shell = true) {
  console.log(`\n> ${command} ${args.join(' ')}   (${cwd})`);
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit', shell });
  if (result.status !== 0)
    throw new Error(`"${command} ${args.join(' ')}" exited with ${result.status}`);
}

function main() {
  const problem = buildPathProblem(root);
  if (problem) throw new Error(problem);
  const host = argValue('--host') ?? pickLanIp(networkInterfaces());
  const anonKey = readDotenv(join(root, '.env')).EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const sdk = androidSdkPath();
  const env = {
    ...process.env,
    ...phoneEnv({ host, anonKey }),
    ANDROID_HOME: sdk,
    NODE_ENV: 'production',
  };
  console.log(`Phone build for the PC at ${host} (Android SDK: ${sdk})`);
  if (!process.argv.includes('--skip-prebuild')) {
    run('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install'], mobile, env);
  }
  // java + the wrapper jar instead of gradlew(.bat): no shell, so the "(1)" in the path and
  // Windows' NoDefaultCurrentDirectoryInExePath cannot break the launch.
  const wrapperJar = join('gradle', 'wrapper', 'gradle-wrapper.jar');
  const wrapperMain = 'org.gradle.wrapper.GradleWrapperMain';
  // Only arm64-v8a (every phone of the last years): a fraction of the native compile time. The
  // default 2 GB Gradle heap of the Expo template let the daemon die on this project.
  const abi = argValue('--abi') ?? 'arm64-v8a';
  const gradleArgs = [
    '-Dorg.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g',
    `-PreactNativeArchitectures=${abi}`,
  ];
  const launch = ['-classpath', wrapperJar, wrapperMain, ...gradleArgs, 'assembleRelease'];
  run('java', launch, androidDir, env, false);
  mkdirSync(join(root, 'dist'), { recursive: true });
  copyFileSync(releaseApk, outApk);
  console.log(`\nDone: ${outApk}`);
}

main();
