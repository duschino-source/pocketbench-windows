import { contextBridge, ipcRenderer } from 'electron'
import type { PocketBenchAPI, ProgressEvent, UpdateState } from '../shared/contracts'
const api: PocketBenchAPI = {
  cancelOperation: () => ipcRenderer.invoke('pocketbench:cancel'),
  getUpdateState: () => ipcRenderer.invoke('pocketbench:update-state'),
  checkForUpdates: () => ipcRenderer.invoke('pocketbench:update-check'),
  installUpdate: () => ipcRenderer.invoke('pocketbench:update-install'),
  onUpdate: callback => {const listener=(_event:unknown,state:UpdateState)=>callback(state);ipcRenderer.on('pocketbench:update',listener);return ()=>ipcRenderer.removeListener('pocketbench:update',listener)},
  getState: () => ipcRenderer.invoke('pocketbench:state'),
  scan: () => ipcRenderer.invoke('pocketbench:scan'),
  getAppIcon: appId => ipcRenderer.invoke('pocketbench:app-icon',appId),
  investigate: request => ipcRenderer.invoke('pocketbench:investigate',request),
  apply: planId => ipcRenderer.invoke('pocketbench:apply',planId),
  undo: runId => ipcRenderer.invoke('pocketbench:undo',runId),
  saveApiKey: key => ipcRenderer.invoke('pocketbench:save-key',key),
  clearApiKey: () => ipcRenderer.invoke('pocketbench:clear-key'),
  openExternal: url => ipcRenderer.invoke('pocketbench:open-external',url),
  onProgress: callback => { const listener=(_event:unknown,event:ProgressEvent)=>callback(event);ipcRenderer.on('pocketbench:progress',listener);return ()=>ipcRenderer.removeListener('pocketbench:progress',listener) }
}
contextBridge.exposeInMainWorld('pocketbench',api)
