/**
 * 设置 IPC handlers
 */

import { ipcMain, BrowserWindow } from 'electron'
import * as fs from 'fs'
import Store from 'electron-store'

export function registerSettingsHandlers(
  mainStore: Store,
  bootstrapStore: Store,
  setMainStore: (store: Store) => void
) {
  // 获取设置
  ipcMain.handle('settings:get', (_, key: string) => mainStore.get(key))

  // 设置值
  ipcMain.handle('settings:set', (event, key: string, value: unknown) => {
    mainStore.set(key, value)

    // 广播给所有窗口（排除发送者，或者由发送者自己处理）
    // 为了简单，广播给所有窗口，渲染进程需要处理重复更新
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('settings:changed', { key, value })
      }
    })

    // 如果是安全设置，同步更新到 SecurityManager
    if (key === 'securitySettings') {
      const { securityManager } = require('../security')
      securityManager.updateConfig(value)
    }

    return true
  })

  // 获取数据路径
  ipcMain.handle('settings:getDataPath', () => mainStore.path)

  // 设置数据路径
  ipcMain.handle('settings:setDataPath', async (_, newPath: string) => {
    try {
      if (!fs.existsSync(newPath)) {
        throw new Error('Directory does not exist')
      }

      const currentData = mainStore.store
      const newStore = new Store({ cwd: newPath })
      newStore.store = currentData
      bootstrapStore.set('customConfigPath', newPath)
      setMainStore(newStore)
      return true
    } catch {
      return false
    }
  })

  // 恢复工作区 (Legacy fallback, secureFile.ts has a better one)
  ipcMain.handle('workspace:restore:legacy', () => {
    return mainStore.get('lastWorkspacePath')
  })
}
