const {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  session,
  shell
} = require("electron");

const path = require("path");

let mainWindow = null;
let tabs = [];
let activeTabId = null;
let nextTabId = 1;

const UI_HEIGHT = 92;

function normalizeUrl(input) {
  const value = String(input || "").trim();

  if (!value) {
    return "orbit://newtab";
  }

  if (
    value === "orbit://newtab" ||
    value === "orbit://settings"
  ) {
    return value;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  if (
    /^[a-z0-9-]+(\.[a-z0-9-]+)+([/:?#].*)?$/i.test(value)
  ) {
    return `https://${value}`;
  }

  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

function loadOrbitPage(tab, url) {
  if (url === "orbit://newtab") {
    tab.view.webContents.loadFile(
      path.join(__dirname, "../pages/internal.html")
    );

    return true;
  }

  return false;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "Orbit Browser",
    backgroundColor: "#0b1020",
    webPreferences: {
      preload: path.join(__dirname, "../preload/ui.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "../ui/index.html"));

  mainWindow.on("resize", resizeActiveView);

  mainWindow.webContents.on("did-finish-load", () => {
    if (tabs.length === 0) {
      createTab("orbit://newtab");
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTab(url = "orbit://newtab") {
  if (!mainWindow) return null;

  const id = nextTabId++;

  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const tab = {
    id,
    view,
    url,
    title: "New Tab"
  };

  tabs.push(tab);

  view.webContents.setWindowOpenHandler(({ url }) => {
    createTab(url);
    return { action: "deny" };
  });

  view.webContents.on("page-title-updated", (_event, title) => {
    tab.title = title || "New Tab";
    sendTabs();
  });

  view.webContents.on("did-start-loading", () => {
    sendNavigationState(tab, true);
  });

  view.webContents.on("did-stop-loading", () => {
    sendNavigationState(tab, false);
  });

  view.webContents.on("did-navigate", (_event, url) => {
    tab.url = url;
    sendTabs();
    sendNavigationState(tab);
  });

  view.webContents.on("did-navigate-in-page", (_event, url) => {
    tab.url = url;
    sendTabs();
    sendNavigationState(tab);
  });

  view.webContents.on("will-navigate", (_event, url) => {
    tab.url = url;
    sendTabs();
  });

  view.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription) => {
      if (errorCode === -3) return;

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("browser:error", {
          message: errorDescription || "Failed to load page."
        });
      }
    }
  );

  if (activeTabId !== null) {
    const previous = tabs.find(tab => tab.id === activeTabId);

    if (previous) {
      try {
        mainWindow.contentView.removeChildView(previous.view);
      } catch {}
    }
  }

  activeTabId = id;

  mainWindow.contentView.addChildView(view);

  resizeActiveView();

  const normalized = normalizeUrl(url);

  if (!loadOrbitPage(tab, normalized)) {
    view.webContents.loadURL(normalized);
  }

  sendTabs();

  return id;
}

function resizeActiveView() {
  if (!mainWindow || !activeTabId) return;

  const tab = tabs.find(item => item.id === activeTabId);

  if (!tab) return;

  const bounds = mainWindow.getContentBounds();

  tab.view.setBounds({
    x: 0,
    y: UI_HEIGHT,
    width: bounds.width,
    height: Math.max(0, bounds.height - UI_HEIGHT)
  });
}

function activateTab(id) {
  if (!mainWindow) return;

  const tab = tabs.find(item => item.id === id);

  if (!tab) return;

  for (const item of tabs) {
    if (item.id !== id) {
      try {
        mainWindow.contentView.removeChildView(item.view);
      } catch {}
    }
  }

  activeTabId = id;

  mainWindow.contentView.addChildView(tab.view);

  resizeActiveView();

  sendTabs();
  sendNavigationState(tab);
}

function closeTab(id) {
  if (!mainWindow) return;

  const index = tabs.findIndex(item => item.id === id);

  if (index === -1) return;

  const tab = tabs[index];

  try {
    mainWindow.contentView.removeChildView(tab.view);
  } catch {}

  try {
    tab.view.webContents.close();
  } catch {}

  tabs.splice(index, 1);

  if (tabs.length === 0) {
    activeTabId = null;
    createTab("orbit://newtab");
    return;
  }

  if (activeTabId === id) {
    const nextIndex = Math.min(index, tabs.length - 1);
    activeTabId = tabs[nextIndex].id;
    activateTab(activeTabId);
  } else {
    sendTabs();
  }
}

function navigate(id, input) {
  const tab = tabs.find(item => item.id === id);

  if (!tab) return;

  const url = normalizeUrl(input);

  tab.url = url;

  sendTabs();

  if (!loadOrbitPage(tab, url)) {
    tab.view.webContents.loadURL(url);
  }
}

function sendTabs() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  mainWindow.webContents.send(
    "browser:tabs",
    tabs.map(tab => ({
      id: tab.id,
      title: tab.title,
      url: tab.url,
      active: tab.id === activeTabId
    }))
  );
}

function sendNavigationState(tab, loading = false) {
  if (!mainWindow || mainWindow.isDestroyed() || !tab) {
    return;
  }

  mainWindow.webContents.send("browser:navigation", {
    id: tab.id,
    url: tab.view.webContents.getURL() || tab.url,
    canGoBack: tab.view.webContents.canGoBack(),
    canGoForward: tab.view.webContents.canGoForward(),
    loading
  });
}

ipcMain.handle("browser:new-tab", () => {
  return createTab("orbit://newtab");
});

ipcMain.handle("browser:close-tab", (_event, id) => {
  closeTab(id);
});

ipcMain.handle("browser:activate-tab", (_event, id) => {
  activateTab(id);
});

ipcMain.handle("browser:navigate", (_event, { id, url }) => {
  navigate(id, url);
});

ipcMain.handle("browser:back", () => {
  const tab = tabs.find(item => item.id === activeTabId);

  if (tab && tab.view.webContents.canGoBack()) {
    tab.view.webContents.goBack();
  }
});

ipcMain.handle("browser:forward", () => {
  const tab = tabs.find(item => item.id === activeTabId);

  if (tab && tab.view.webContents.canGoForward()) {
    tab.view.webContents.goForward();
  }
});

ipcMain.handle("browser:reload", () => {
  const tab = tabs.find(item => item.id === activeTabId);

  if (!tab) return;

  if (tab.view.webContents.isLoading()) {
    tab.view.webContents.stop();
  } else {
    tab.view.webContents.reload();
  }
});

ipcMain.handle("browser:home", () => {
  navigate(activeTabId, "orbit://newtab");
});

ipcMain.handle("browser:open-external", (_event, url) => {
  if (typeof url === "string") {
    shell.openExternal(url);
  }
});

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      const allowed = [
        "fullscreen",
        "clipboard-read",
        "clipboard-sanitized-write"
      ];

      callback(allowed.includes(permission));
    }
  );

  session.defaultSession.on("will-download", (_event, item) => {
    item.once("done", (_event, state) => {
      if (!mainWindow || mainWindow.isDestroyed()) return;

      mainWindow.webContents.send("browser:download", {
        filename: item.getFilename(),
        state,
        path: item.getSavePath()
      });
    });
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  for (const tab of tabs) {
    try {
      tab.view.webContents.close();
    } catch {}
  }

  tabs = [];
});
