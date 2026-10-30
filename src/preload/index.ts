import { contextBridge, ipcRenderer } from 'electron'
import type { PocketBenchAPI, ProgressEvent } from '../shared/contracts'
const api: PocketBenchAPI = {
  getState: () => ipcRenderer.invoke('pocketbench:state'),
  scan: () => ipcRenderer.invoke('pocketbench:scan'),
  investigate: request => ipcRenderer.invoke('pocketbench:investigate',request),
  apply: planId => ipcRenderer.invoke('pocketbench:apply',planId),
  undo: runId => ipcRenderer.invoke('pocketbench:undo',runId),
  saveApiKey: key => ipcRenderer.invoke('pocketbench:save-key',key),
  clearApiKey: () => ipcRenderer.invoke('pocketbench:clear-key'),
  openExternal: url => ipcRenderer.invoke('pocketbench:open-external',url),
  onProgress: callback => { const listener=(_event:unknown,event:ProgressEvent)=>callback(event);ipcRenderer.on('pocketbench:progress',listener);return ()=>ipcRenderer.removeListener('pocketbench:progress',listener) }
}
contextBridge.exposeInMainWorld('pocketbench',api)
