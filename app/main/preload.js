'use strict';
// Мост между окном и главным процессом. В окно отдаём только invoke и подписку на события.
const { contextBridge, ipcRenderer } = require('electron');

const EVENTS = ['search:progress', 'search:done', 'search:error', 'app:visibility', 'ai:state'];

contextBridge.exposeInMainWorld('api', {
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
  on: (channel, cb) => {
    if (!EVENTS.includes(channel)) return () => {};
    const fn = (_e, data) => cb(data);
    ipcRenderer.on(channel, fn);
    return () => ipcRenderer.removeListener(channel, fn);
  },
});
