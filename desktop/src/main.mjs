// Electron entry of the desktop app (D-093): one window that starts the local stack, then shows
// the web app. `--smoke` checks the install is complete and its programs run, then quits (CI).
import { app, BrowserWindow, Menu, shell } from 'electron';

import { resolveLayout } from './layout.mjs';
import { checkPackage } from './package-check.mjs';
import { provisionStack } from './provision.mjs';
import { errorPage, progressPage } from './splash.mjs';
import { Stack } from './stack.mjs';
import { httpOk, runToEnd, spawnLogged } from './system.mjs';
import { createWebServer } from './web-server.mjs';

const SMOKE = process.argv.includes('--smoke');
if (process.platform === 'linux') app.commandLine.appendSwitch('no-sandbox');
if (!app.requestSingleInstanceLock()) app.quit();

function buildStack(layout, onLog) {
  return new Stack({
    layout,
    version: app.getVersion(),
    run: runToEnd,
    spawn: spawnLogged(layout.logsDir),
    httpOk,
    onLog,
    provision: () => provisionStack({ layout, version: app.getVersion() }),
    startWeb: (port) =>
      new Promise((resolve, reject) => {
        const server = createWebServer(layout.webDir);
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => resolve(server));
      }),
  });
}

function menuFor(layout) {
  return Menu.buildFromTemplate([
    {
      label: 'Travelist',
      submenu: [
        { label: 'Edit keys file', click: () => shell.openPath(layout.envFile) },
        { label: 'Open logs folder', click: () => shell.openPath(layout.logsDir) },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'quit' },
      ],
    },
  ]);
}

function layoutOfThisRun() {
  return resolveLayout({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
    userData: app.getPath('userData'),
    platform: process.platform,
  });
}

async function smokeCheck(layout) {
  const problems = await checkPackage(layout, runToEnd);
  for (const problem of problems) console.error(problem);
  return problems.length === 0 ? 0 : 1;
}

async function startAndShow(layout, window) {
  let lastLine = '';
  const stack = buildStack(layout, (line) => (lastLine = line));
  app.once('before-quit', () => stack.stop());
  try {
    await stack.start((step) => window.loadURL(progressPage(step, lastLine)));
  } catch (error) {
    await window.loadURL(errorPage(error.message));
    return;
  }
  await window.loadURL(`http://127.0.0.1:${layout.ports.web}/`);
}

app.whenReady().then(async () => {
  const layout = layoutOfThisRun();
  Menu.setApplicationMenu(menuFor(layout));
  const window = new BrowserWindow({ width: 1200, height: 820, title: 'Travelist', show: !SMOKE });
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  if (SMOKE) return app.exit(await smokeCheck(layout));
  await startAndShow(layout, window);
});

app.on('window-all-closed', () => app.quit());
