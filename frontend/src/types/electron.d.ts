interface ElectronAPI {
  // 通用调用方法：channel 是 IPC 名称，如 'window:minimize', 'backend:restart'
  invoke: (channel: string, ...args: any[]) => Promise<any>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export {};
