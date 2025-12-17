/**
 * 终端 IPC handlers
 * 使用 node-pty 实现原生终端
 */

import { ipcMain, BrowserWindow } from 'electron'
import { exec, execSync } from 'child_process'
import * as fs from 'fs'

// 延迟加载 node-pty
let pty: typeof import('node-pty') | null = null

function getPty() {
  if (!pty) {
    pty = require('node-pty')
  }
  return pty
}

// 终端会话管理
const terminals = new Map<string, import('node-pty').IPty>()

export function registerTerminalHandlers(getMainWindow: () => BrowserWindow | null) {
  // 创建终端
  ipcMain.handle('terminal:create', async (_, options: {
    id: string
    cwd?: string
    shell?: string
  }) => {
    const { id, cwd, shell: customShell } = options
    if (terminals.has(id)) return true

    const isWindows = process.platform === 'win32'
    const defaultShell = isWindows ? 'powershell.exe' : (process.env.SHELL || '/bin/bash')
    const shellToUse = customShell || defaultShell
    const workingDir = cwd || process.cwd()

    try {
      const nodePty = getPty()!
      const ptyProcess = nodePty.spawn(shellToUse, [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: workingDir,
        env: process.env as any,
      })

      terminals.set(id, ptyProcess)

      ptyProcess.onData((data) => {
        getMainWindow()?.webContents.send('terminal:data', { id, data })
      })

      ptyProcess.onExit(({ exitCode }) => {
        getMainWindow()?.webContents.send('terminal:exit', { id, code: exitCode })
        terminals.delete(id)
      })

      return true
    } catch (e) {
      console.error(`[Terminal] Failed to spawn PTY ${id}:`, e)
      return false
    }
  })

  // 终端输入
  ipcMain.handle('terminal:input', (_, { id, data }: { id: string; data: string }) => {
    const term = terminals.get(id)
    if (term) term.write(data)
  })

  // 终端调整大小
  ipcMain.handle('terminal:resize', (_, { id, cols, rows }: {
    id: string
    cols: number
    rows: number
  }) => {
    const term = terminals.get(id)
    if (term) term.resize(cols, rows)
  })

  // 关闭终端
  ipcMain.on('terminal:kill', (_, id?: string) => {
    if (id) {
      const term = terminals.get(id)
      if (term) {
        term.kill()
        terminals.delete(id)
      }
    } else {
      terminals.forEach(term => term.kill())
      terminals.clear()
    }
  })

  // 获取可用 shell 列表
  ipcMain.handle('terminal:get-shells', async () => {
    const shells: { label: string; path: string }[] = []
    
    const findShell = (cmd: string): string[] => {
      try {
        const result = process.platform === 'win32'
          ? execSync(`where ${cmd}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
          : execSync(`which ${cmd}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
        return result.trim().split(/\r?\n/).filter(Boolean)
      } catch {
        return []
      }
    }
    
    if (process.platform === 'win32') {
      shells.push({ label: 'PowerShell', path: 'powershell.exe' })
      shells.push({ label: 'Command Prompt', path: 'cmd.exe' })
      
      const bashPaths = findShell('bash')
      const gitBash = bashPaths.find(p => 
        p.toLowerCase().includes('git') && fs.existsSync(p)
      )
      if (gitBash) {
        shells.push({ label: 'Git Bash', path: gitBash })
      }
      
      const wslPaths = findShell('wsl')
      if (wslPaths.length > 0) {
        try {
          execSync('wsl --list --quiet', { stdio: 'ignore', timeout: 2000 })
          shells.push({ label: 'WSL', path: 'wsl.exe' })
        } catch {}
      }
    } else {
      const bash = findShell('bash')[0]
      if (bash) shells.push({ label: 'Bash', path: bash })
      
      const zsh = findShell('zsh')[0]
      if (zsh) shells.push({ label: 'Zsh', path: zsh })
      
      const fish = findShell('fish')[0]
      if (fish) shells.push({ label: 'Fish', path: fish })
    }
    
    return shells
  })

  // 执行命令（非交互式）
  ipcMain.handle('shell:execute', async (
    _,
    command: string,
    cwd?: string,
    timeout = 60000
  ) => {
    return new Promise((resolve) => {
      exec(command, {
        cwd: cwd || process.cwd(),
        maxBuffer: 10 * 1024 * 1024,
        timeout,
      }, (error: any, stdout: string, stderr: string) => {
        resolve({
          output: stdout,
          errorOutput: stderr,
          exitCode: error ? error.code || 1 : 0,
        })
      })
    })
  })
}

// 清理所有终端
export function cleanupTerminals() {
  terminals.forEach(term => term.kill())
  terminals.clear()
}
