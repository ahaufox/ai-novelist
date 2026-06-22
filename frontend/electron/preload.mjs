import { contextBridge, ipcRenderer } from 'electron';

// 暴露通用调用方法
contextBridge.exposeInMainWorld('electron', {
  // 通用 invoke：channel 就是 IPC 名称，args 是参数
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
});
