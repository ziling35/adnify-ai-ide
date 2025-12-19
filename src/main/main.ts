/**
 * Adnify Main Process
 * 重构后的主进程入口（支持多窗口和安全模块）
 */

import { app, BrowserWindow } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import Store from 'electron-store'
import { registerAllHandlers, cleanupAllHandlers, updateLLMServiceWindow } from './ipc'
import { lspManager } from './lspManager'
import { securityManager, updateWhitelist } from './security'

// 共享安全常量（与 renderer 保持一致）
const SECURITY_DEFAULTS = {
  SHELL_COMMANDS: [
    // 包管理器
    'npm', 'yarn', 'pnpm', 'bun',
    // 运行时
    'node', 'npx', 'deno',
    // 版本控制
    'git',
    // 编程语言
    'python', 'python3', 'pip', 'pip3',
    'java', 'javac', 'mvn', 'gradle',
    'go', 'rust', 'cargo',
    // 构建工具
    'make', 'gcc', 'clang', 'cmake',
    // 常用命令
    'pwd', 'ls', 'dir', 'cat', 'type', 'echo', 'mkdir', 'touch', 'rm', 'mv', 'cp', 'cd',
  ],
  GIT_SUBCOMMANDS: [
    'status', 'log', 'diff', 'add', 'commit', 'push', 'pull',
    'branch', 'checkout', 'merge', 'rebase', 'clone', 'remote',
    'fetch', 'show', 'rev-parse', 'init', 'stash', 'tag',
  ],
} as const

// ==========================================
// Store 初始化
// ==========================================

const bootstrapStore = new Store({ name: 'bootstrap' })
let mainStore: Store

function initStore() {
  const customPath = bootstrapStore.get('customConfigPath') as string | undefined
  if (customPath && fs.existsSync(customPath)) {
    console.log('[Main] Using custom config path:', customPath)
    mainStore = new Store({ cwd: customPath })
  } else {
    console.log('[Main] Using default config path')
    mainStore = new Store()
  }
}

// 初始化 store
initStore()

// ==========================================
// 窗口管理
// ==========================================

const windows = new Set<BrowserWindow>()
let mainWindow: BrowserWindow | null = null

function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

// 单例锁定
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

function createWindow(isEmpty = true): BrowserWindow {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 700,
    backgroundColor: '#09090b',
    show: false, // 等待渲染完成后显示
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  windows.add(win)
  if (!mainWindow) {
    mainWindow = win
  }

  // 每个窗口都需要更新 LLM service 的引用
  updateLLMServiceWindow(win)

  win.on('closed', () => {
    windows.delete(win)
    if (windows.size === 0) {
      mainWindow = null
      cleanupAllHandlers()
      lspManager.stopAllServers()
    } else {
      // 如果关闭的是 mainWindow，选择一个新的
      if (mainWindow === win) {
        mainWindow = windows.values().next().value ?? null
      }
    }
  })

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    win.loadURL(`http://localhost:5173${isEmpty ? '?empty=1' : ''}`)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'), { query: isEmpty ? { empty: '1' } : undefined })
  }

  return win
}

// ==========================================
// 应用生命周期
// ==========================================

app.whenReady().then(() => {
  console.log('[Security] 🔒 初始化安全模块...')

  // 使用共享常量作为默认值
  const securityConfig = mainStore.get('securitySettings', {
    enablePermissionConfirm: true,
    enableAuditLog: true,
    strictWorkspaceMode: true,
    allowedShellCommands: [...SECURITY_DEFAULTS.SHELL_COMMANDS],
    allowedGitSubcommands: [...SECURITY_DEFAULTS.GIT_SUBCOMMANDS],
  }) as any

  securityManager.updateConfig(securityConfig)

  // 初始化白名单
  const shellCommands = securityConfig.allowedShellCommands || [...SECURITY_DEFAULTS.SHELL_COMMANDS]
  const gitCommands = securityConfig.allowedGitSubcommands || [...SECURITY_DEFAULTS.GIT_SUBCOMMANDS]
  updateWhitelist(shellCommands, gitCommands)

  console.log('[Security] ✅ 安全模块已初始化')

  // 注册所有 IPC handlers
  registerAllHandlers({
    getMainWindow,
    createWindow,
    mainStore,
    bootstrapStore,
    setMainStore: (store) => {
      mainStore = store
    },
  })

  // 创建第一个窗口
  const firstWin = createWindow()
  securityManager.setMainWindow(firstWin)
})

// 处理第二个实例启动（打开新窗口）
app.on('second-instance', () => {
  createWindow(false)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (windows.size === 0) {
    createWindow()
  }
})
