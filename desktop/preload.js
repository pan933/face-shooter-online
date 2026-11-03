'use strict';

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('faceShooterDesktop', Object.freeze({
  platform: process.platform,
  isWindows: process.platform === 'win32'
}));
