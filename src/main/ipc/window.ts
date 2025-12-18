/**
 * 窗口控制 IPC handlers
 */

import { ipcMain, BrowserWindow } from 'electron'

export function registerWindowHandlers(createWindow: (isEmpty?: boolean) => BrowserWindow) {
  ipcMain.on('window:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.minimize()
  })

  ipcMain.on('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })

  ipcMain.on('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.close()
  })

  // 新增：打开新窗口
  ipcMain.handle('window:new', () => {
    createWindow(true)
  })
}
