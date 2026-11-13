const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('companygenDesktop', Object.freeze({
  isDesktop: true,
  openWhatsAppExternal: () => ipcRenderer.invoke('companygen:open-whatsapp'),
  readWhatsAppIdentity: () => ipcRenderer.invoke('companygen:whatsapp-identity'),
}));
