const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("orbit", {
  newTab: () =>
    ipcRenderer.invoke("browser:new-tab"),

  closeTab: id =>
    ipcRenderer.invoke("browser:close-tab", id),

  activateTab: id =>
    ipcRenderer.invoke("browser:activate-tab", id),

  navigate: (id, url) =>
    ipcRenderer.invoke("browser:navigate", { id, url }),

  back: () =>
    ipcRenderer.invoke("browser:back"),

  forward: () =>
    ipcRenderer.invoke("browser:forward"),

  reload: () =>
    ipcRenderer.invoke("browser:reload"),

  home: () =>
    ipcRenderer.invoke("browser:home"),

  openExternal: url =>
    ipcRenderer.invoke("browser:open-external", url),

  onTabs: callback => {
    ipcRenderer.on("browser:tabs", (_event, tabs) => {
      callback(tabs);
    });
  },

  onNavigation: callback => {
    ipcRenderer.on("browser:navigation", (_event, data) => {
      callback(data);
    });
  },

  onDownload: callback => {
    ipcRenderer.on("browser:download", (_event, data) => {
      callback(data);
    });
  },

  onError: callback => {
    ipcRenderer.on("browser:error", (_event, data) => {
      callback(data);
    });
  }
});
