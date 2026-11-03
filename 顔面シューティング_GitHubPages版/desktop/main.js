const { app, BrowserWindow, session, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const http = require('http');

const GAME_DIR = path.join(__dirname, 'game');
const PORT = 38123;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.wasm': 'application/wasm',
  '.tflite': 'application/octet-stream',
  '.bin': 'application/octet-stream'
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath.endsWith('/')) urlPath += 'index.html';
      const filePath = path.normalize(path.join(GAME_DIR, urlPath));

      if (!filePath.startsWith(GAME_DIR)) {
        res.writeHead(403);
        return res.end('Forbidden');
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          return res.end('Not found');
        }
        const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type });
        res.end(data);
      });
    });
    server.on('error', (e) => {
      dialog.showErrorBox('起動エラー', 'ポート ' + PORT + ' が使えません。\n' + e.message);
      app.quit();
    });
    server.listen(PORT, 'localhost', () => resolve(PORT));
  });
}

let mainWindow = null;

async function createWindow() {
  const port = await startServer();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    autoHideMenuBar: true
  });

  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    cb(['media', 'mediaKeySystem'].includes(permission));
  });
  session.defaultSession.setPermissionCheckHandler(() => true);

  mainWindow.loadURL(`http://localhost:${port}/index.html`);
}

function setupAutoUpdate() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;

  autoUpdater.on('update-downloaded', (info) => {
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: 'アップデート',
        message: `新しいバージョン ${info.version} をダウンロードしました。`,
        detail: '今すぐ再起動して更新しますか？',
        buttons: ['今すぐ更新', 'あとで']
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
  });

  autoUpdater.on('error', (err) => {
    console.error('Update error:', err);
  });

  autoUpdater.checkForUpdates();
}

app.whenReady().then(async () => {
  await createWindow();
  setupAutoUpdate();
});

app.on('window-all-closed', () => app.quit());