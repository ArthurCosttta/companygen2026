const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('companygenDesktop', Object.freeze({
  isDesktop: true,
  openWhatsAppExternal: () => ipcRenderer.invoke('companygen:open-whatsapp'),
  readWhatsAppIdentity: () => ipcRenderer.invoke('companygen:whatsapp-identity'),
  pollWhatsAppInbox: () => ipcRenderer.invoke('companygen:whatsapp-poll-inbox'),
  sendWhatsAppReply: (payload) => ipcRenderer.invoke('companygen:whatsapp-send-reply', payload),
  logoutWhatsAppWebview: () => ipcRenderer.invoke('companygen:whatsapp-logout'),
  showWindow: (tab) => ipcRenderer.invoke('companygen:show-window', tab),
  quitApp: () => ipcRenderer.invoke('companygen:quit-app'),
  notifyDesktop: (payload) => ipcRenderer.invoke('companygen:notify-desktop', payload),
  setTrayStatus: (payload) => ipcRenderer.invoke('companygen:set-tray-status', payload),
  onWhatsappTypingProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('companygen:wa-typing-progress', listener);
    return () => ipcRenderer.removeListener('companygen:wa-typing-progress', listener);
  },
}));
