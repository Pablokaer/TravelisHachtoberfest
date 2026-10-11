// Where everything is (D-093). A packaged app reads its programs and data from the `resources`
// folder next to the executable and writes only inside the user's own data folder: an AppImage
// or a Program Files install is read-only.
import { join } from 'node:path';

export const PORTS = { web: 8081, service: 8787, supabase: 54321 };
export const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/**
 * @typedef {object} Layout
 * @property {string} webDir          the exported web app
 * @property {string} stackTemplate   the Supabase project (config, migrations, seed, functions)
 * @property {string} serviceExe      the city and trip-planner service
 * @property {string} supabaseExe     the Supabase command line
 * @property {string} stackDir        the writable copy of the Supabase project
 * @property {string} stateDir        what the service writes (cities built on demand, caches)
 * @property {string} envFile         the keys of the optional integrations
 * @property {string} logsDir
 * @property {typeof PORTS} ports
 * @property {string} dbUrl
 */

/**
 * @param {{ packaged: boolean, resourcesPath: string, appPath: string, userData: string, platform: string }} where
 * @returns {Layout}
 * @example resolveLayout({ packaged: app.isPackaged, resourcesPath: process.resourcesPath, appPath: app.getAppPath(), userData: app.getPath('userData'), platform: process.platform })
 */
export function resolveLayout({ packaged, resourcesPath, appPath, userData, platform }) {
  const resources = packaged ? resourcesPath : join(appPath, 'resources');
  const exe = (name) => (platform === 'win32' ? `${name}.exe` : name);
  return {
    webDir: join(resources, 'web'),
    stackTemplate: join(resources, 'stack'),
    serviceExe: join(resources, 'service', exe('travelist-service')),
    supabaseExe: join(resources, 'bin', exe('supabase')),
    stackDir: join(userData, 'stack'),
    stateDir: join(userData, 'state'),
    envFile: join(userData, 'keys.env'),
    logsDir: join(userData, 'logs'),
    ports: PORTS,
    dbUrl: DB_URL,
  };
}
