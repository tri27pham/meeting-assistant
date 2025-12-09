const { app, BrowserWindow, ipcMain, globalShortcut, screen } = require('electron');
const path = require('path');

// Keep a global reference to prevent garbage collection
let overlayWindow = null;

const isDev = process.env.NODE_ENV !== 'production' || !app.isPackaged;

function createOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.size;
  const { x: workX, y: workY } = primaryDisplay.workArea;

  overlayWindow = new BrowserWindow({
    width: screenWidth,
    height: screenHeight,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    // Critical: Makes window invisible to screen capture/recording
    type: 'panel',
    visibleOnAllWorkspaces: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Exclude from screen capture (macOS 10.14+)
  overlayWindow.setContentProtection(true);

  // Set window level to float above most windows
  overlayWindow.setAlwaysOnTop(true, 'floating');

  // Enable click-through on transparent areas by default
  // The renderer will tell us when mouse enters/leaves panels
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  if (isDev) {
    overlayWindow.loadURL('http://localhost:3000');
    // Uncomment to open DevTools
    // overlayWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    overlayWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

// Register global hotkeys
function registerHotkeys() {
  // Toggle overlay visibility: Cmd+/ (primary)
  globalShortcut.register('CommandOrControl+/', () => {
    if (overlayWindow) {
      if (overlayWindow.isVisible()) {
        overlayWindow.hide();
      } else {
        overlayWindow.show();
      }
    }
  });

  // Toggle overlay visibility: Cmd+Shift+\ (alternative)
  globalShortcut.register('CommandOrControl+Shift+\\', () => {
    if (overlayWindow) {
      if (overlayWindow.isVisible()) {
        overlayWindow.hide();
      } else {
        overlayWindow.show();
      }
    }
  });

  // Manual AI suggestion trigger: Cmd+Enter
  globalShortcut.register('CommandOrControl+Return', () => {
    if (overlayWindow) {
      overlayWindow.webContents.send('trigger-ai-suggestion');
    }
  });

  // Reset layout: Cmd+\
  globalShortcut.register('CommandOrControl+\\', () => {
    if (overlayWindow) {
      overlayWindow.webContents.send('reset-layout');
    }
  });
}

// IPC Handlers
function setupIPC() {
  // Session control
  ipcMain.handle('session:start', async () => {
    // TODO: Integrate with Session Manager service
    console.log('[Main] Session start requested');
    return { success: true };
  });

  ipcMain.handle('session:stop', async () => {
    // TODO: Integrate with Session Manager service
    console.log('[Main] Session stop requested');
    return { success: true };
  });

  ipcMain.handle('session:toggle-pause', async () => {
    // TODO: Integrate with Session Manager service
    console.log('[Main] Session pause toggle requested');
    return { success: true, paused: false };
  });

  // AI actions
  ipcMain.handle('ai:trigger-action', async (event, actionType, metadata) => {
    // TODO: Integrate with AI Orchestration service
    console.log('[Main] AI action triggered:', actionType, metadata);
    return { success: true };
  });

  // Window control
  ipcMain.on('window:minimize', () => {
    if (overlayWindow) overlayWindow.hide();
  });

  ipcMain.on('window:close', () => {
    if (overlayWindow) overlayWindow.hide();
  });

  // Mouse enter/leave panel - toggle click-through
  ipcMain.on('mouse:enter-panel', () => {
    if (overlayWindow) {
      overlayWindow.setIgnoreMouseEvents(false);
    }
  });

  ipcMain.on('mouse:leave-panel', () => {
    if (overlayWindow) {
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    }
  });
}

app.whenReady().then(() => {
  createOverlayWindow();
  registerHotkeys();
  setupIPC();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOverlayWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (overlayWindow) {
      overlayWindow.show();
      overlayWindow.focus();
    }
  });
}
