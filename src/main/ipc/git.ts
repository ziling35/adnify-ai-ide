/**
 * Git IPC handlers
 * 使用 dugite 进行原生 Git 操作
 */

import { ipcMain } from 'electron'
import { exec } from 'child_process'

export function registerGitHandlers() {
  ipcMain.handle('git:exec', async (_, args: string[], cwd: string) => {
    try {
      // 尝试使用 dugite
      const { GitProcess } = require('dugite')
      const result = await GitProcess.exec(args, cwd)
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      }
    } catch {
      // 回退到 child_process
      return new Promise((resolve) => {
        exec(`git ${args.join(' ')}`, { cwd }, (error: any, stdout: string, stderr: string) => {
          resolve({
            stdout,
            stderr,
            exitCode: error ? error.code || 1 : 0,
          })
        })
      })
    }
  })
}
