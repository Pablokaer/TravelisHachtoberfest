// Pure helpers for build-android-apk.mjs: which address of this PC the phone should call, and
// the EXPO_PUBLIC_* values to bake into the APK (they are inlined at bundle time, so a phone
// build cannot keep the 127.0.0.1 defaults of .env: on the phone that is the phone itself).
const SUPABASE_PORT = 54321;
const CITY_BUILDER_PORT = 8787;

// Lower is better. 192.168.56.x is VirtualBox's host-only network and 172.x is where Docker/WSL
// put their virtual adapters: neither is reachable from a phone on the Wi-Fi.
function lanRank(address) {
  if (address.startsWith('192.168.56.')) return 3;
  if (address.startsWith('192.168.') || address.startsWith('10.')) return 0;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 2;
  return 4;
}

/** First private IPv4 of `os.networkInterfaces()`, best Wi-Fi/Ethernet candidate first.
 *  pickLanIp({ 'Wi-Fi': [{ address: '192.168.1.2', family: 'IPv4', internal: false }] }) */
export function pickLanIp(interfaces) {
  const candidates = Object.values(interfaces)
    .flat()
    .filter((nic) => nic && nic.family === 'IPv4' && !nic.internal)
    .map((nic) => nic.address)
    .filter((address) => lanRank(address) < 4)
    .sort((a, b) => lanRank(a) - lanRank(b));
  if (candidates.length === 0) {
    const seen = Object.keys(interfaces).join(', ');
    throw new Error(`No private IPv4 address found (adapters seen: ${seen}); pass --host <pc-ip>.`);
  }
  return candidates[0];
}

/** Environment for the phone build: the PC's Supabase and city builder, local mode on.
 *  phoneEnv({ host: '192.168.1.2', anonKey }) → { EXPO_PUBLIC_SUPABASE_URL: 'http://192.168.1.2:54321', … } */
export function phoneEnv({ host, anonKey }) {
  if (!anonKey) {
    throw new Error(
      'EXPO_PUBLIC_SUPABASE_ANON_KEY is empty: copy .env.example to .env and fill it with the ' +
        'ANON_KEY printed by `pnpm exec supabase status`.',
    );
  }
  return {
    EXPO_PUBLIC_SUPABASE_URL: `http://${host}:${SUPABASE_PORT}`,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    EXPO_PUBLIC_CITY_BUILDER_URL: `http://${host}:${CITY_BUILDER_PORT}`,
    EXPO_PUBLIC_LOCAL_MODE: 'true',
  };
}

/** Why this checkout cannot be built in place, or null. React Native's Gradle tasks run `cmd`
 *  with the path unquoted, and `cmd` ends the path at the first "(" (found on a "travelist-main(1)"
 *  folder, after a 26-minute build died in the last step).
 *  buildPathProblem('C:/Users/me/app(1)') → 'C:/Users/me/app(1) contains parentheses…' */
export function buildPathProblem(root) {
  if (!/[()]/.test(root)) return null;
  return (
    `${root} contains parentheses, which break React Native's Gradle build on Windows. ` +
    'Copy the project to a plain path (for example C:/wf-apk), run "pnpm install" there ' +
    'and build from it.'
  );
}
