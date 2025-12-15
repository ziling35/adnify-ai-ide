/**
 * Adnify Main Process
 * 使用原生模块实现高性能
 */

import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { spawn } from 'child_process'
import Store from 'electron-store'
import { LLMService } from './llm/llmService'

// ==========================================
// Native Modules - 原生高性能模块
// ==========================================

// 终端 - node-pty (原生 PTY)
import * as pty from 'node-pty'

// 文件搜索 - ripgrep (原生搜索，比 JS 快 10x+)
import { rgPath } from '@vscode/ripgrep'

// 文件监听 - @parcel/watcher (比 chokidar 更快更省内存)
import * as watcher from '@parcel/watcher'

// 文件编码检测
import * as jschardet from 'jschardet'
import * as iconv from 'iconv-lite'

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
initStore()

// ==========================================
// 全局状态
// ==========================================

let mainWindow: BrowserWindow | null = null
let llmService: LLMService | null = null

// 终端会话管理
const terminals = new Map<string, pty.IPty>()

// 文件监听订阅
let watcherSubscription: watcher.AsyncSubscription | null = null

// ==========================================
// 窗口创建
// ==========================================

function createWindow() {
    const iconPath = process.env.NODE_ENV === 'development'
        ? path.join(__dirname, '../../public/icon.png')
        : path.join(__dirname, '../renderer/icon.png')

    mainWindow = new BrowserWindow({
        width: 1600,
        height: 1000,
        minWidth: 1200,
        minHeight: 700,
        frame: false,
        titleBarStyle: 'hidden',
        icon: iconPath,
        trafficLightPosition: { x: 15, y: 15 },
        backgroundColor: '#0d1117',
        webPreferences: {
            preload: path.join(__dirname, '../preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    })

    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:5173')
        mainWindow.webContents.openDevTools()
    } else {
        mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
    }

    llmService = new LLMService(mainWindow)
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// 清理资源
app.on('before-quit', async () => {
    // 关闭所有终端
    terminals.forEach(term => term.kill())
    terminals.clear()
    
    // 停止文件监听
    if (watcherSubscription) {
        await watcherSubscription.unsubscribe()
    }
})

// ==========================================
// Window Controls
// ==========================================

ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
})
ipcMain.on('window:close', () => mainWindow?.close())

// ==========================================
// Shell Execution (非交互式命令)
// ==========================================

ipcMain.handle('shell:execute', async (_, command: string, cwd?: string) => {
    const { exec } = require('child_process')
    return new Promise((resolve) => {
        exec(command, { 
            cwd: cwd || process.cwd(),
            maxBuffer: 10 * 1024 * 1024, // 10MB buffer
            timeout: 60000 // 60s timeout
        }, (error: any, stdout: string, stderr: string) => {
            resolve({
                output: stdout,
                errorOutput: stderr,
                exitCode: error ? error.code || 1 : 0
            })
        })
    })
})

// ==========================================
// File Operations (原生增强)
// ==========================================

ipcMain.handle('file:open', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
        properties: ['openFile'],
        filters: [{ name: 'All Files', extensions: ['*'] }]
    })
    if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0]
        const content = await readFileWithEncoding(filePath)
        return { path: filePath, content }
    }
    return null
})

ipcMain.handle('dialog:showOpen', async (_, options: { 
    properties?: string[]
    defaultPath?: string
    filters?: { name: string; extensions: string[] }[] 
}) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
        properties: (options.properties || ['openFile']) as any,
        defaultPath: options.defaultPath,
        filters: options.filters || [{ name: 'All Files', extensions: ['*'] }]
    })
    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths
    }
    return null
})

ipcMain.handle('file:openFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
        properties: ['openDirectory']
    })
    if (!result.canceled && result.filePaths.length > 0) {
        const folderPath = result.filePaths[0]
        mainStore.set('lastWorkspacePath', folderPath)
        
        // 启动原生文件监听 (@parcel/watcher)
        await startFileWatcher(folderPath)

        return folderPath
    }
    return null
})

// 原生文件监听 - 比 chokidar 更快
async function startFileWatcher(folderPath: string) {
    // 停止之前的监听
    if (watcherSubscription) {
        await watcherSubscription.unsubscribe()
    }

    try {
        watcherSubscription = await watcher.subscribe(folderPath, (err: Error | null, events: watcher.Event[]) => {
            if (err) {
                console.error('[Watcher] Error:', err)
                return
            }
            
            for (const event of events) {
                mainWindow?.webContents.send('file:changed', {
                    event: event.type, // 'create' | 'update' | 'delete'
                    path: event.path
                })
            }
        }, {
            ignore: [
                '**/node_modules/**',
                '**/.git/**',
                '**/dist/**',
                '**/build/**',
                '**/*.log'
            ]
        })
        
        console.log('[Watcher] Started watching:', folderPath)
    } catch (e) {
        console.error('[Watcher] Failed to start:', e)
    }
}

ipcMain.handle('workspace:restore', () => {
    return mainStore.get('lastWorkspacePath')
})

ipcMain.handle('file:readDir', async (_, dirPath: string) => {
    try {
        const items = fs.readdirSync(dirPath, { withFileTypes: true })
        return items.map(item => ({
            name: item.name,
            path: path.join(dirPath, item.name),
            isDirectory: item.isDirectory()
        }))
    } catch {
        return []
    }
})

// 目录树生成
ipcMain.handle('file:getTree', async (_, dirPath: string, maxDepth: number = 2) => {
    if (!dirPath || !fs.existsSync(dirPath)) return ''
    
    const IGNORED_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.vscode', '.idea', 'coverage', 'tmp', '.adnify'])
    const IGNORED_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.exe', '.dll', '.bin', '.lock'])

    function buildTree(currentPath: string, depth: number, prefix: string = ''): string {
        if (depth > maxDepth) return ''
        try {
            const items = fs.readdirSync(currentPath, { withFileTypes: true })
                .sort((a, b) => {
                    if (a.isDirectory() && !b.isDirectory()) return -1
                    if (!a.isDirectory() && b.isDirectory()) return 1
                    return a.name.localeCompare(b.name)
                })
            let result = ''
            const filteredItems = items.filter(item => {
                if (item.isDirectory() && IGNORED_DIRS.has(item.name)) return false
                if (item.isFile()) {
                    const ext = path.extname(item.name).toLowerCase()
                    if (IGNORED_EXTS.has(ext)) return false
                }
                return true
            })
            
            filteredItems.forEach((item, index) => {
                const isLast = index === filteredItems.length - 1
                const pointer = isLast ? '└── ' : '├── '
                result += `${prefix}${pointer}${item.name}${item.isDirectory() ? '/' : ''}\n`
                if (item.isDirectory()) {
                    const nextPrefix = prefix + (isLast ? '    ' : '│   ')
                    result += buildTree(path.join(currentPath, item.name), depth + 1, nextPrefix)
                }
            })
            return result
        } catch { return '' }
    }
    return buildTree(dirPath, 0)
})


// ==========================================
// Native Search (Ripgrep - 比 JS 快 10x+)
// ==========================================

interface SearchOptions {
    isRegex: boolean
    isCaseSensitive: boolean
    isWholeWord: boolean
    include?: string
    exclude?: string
}

ipcMain.handle('file:search', async (_, query: string, rootPath: string, options: SearchOptions) => {
    if (!query || !rootPath) return []

    return new Promise((resolve) => {
        const args = [
            '--json',
            '--max-count', '2000',
            '--max-filesize', '1M', // 跳过大文件
        ]

        if (options?.isCaseSensitive) args.push('--case-sensitive')
        else args.push('--smart-case')

        if (options?.isWholeWord) args.push('--word-regexp')
        if (!options?.isRegex) args.push('--fixed-strings')

        // 默认忽略
        const defaultIgnores = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**']
        defaultIgnores.forEach(glob => args.push('--glob', `!${glob}`))

        if (options?.exclude) {
            options.exclude.split(',').forEach(ex => args.push('--glob', `!${ex.trim()}`))
        }
        if (options?.include) {
            options.include.split(',').forEach(inc => args.push('--glob', inc.trim()))
        }

        args.push('--', query, rootPath)

        const rg = spawn(rgPath, args)
        let output = ''

        rg.stdout.on('data', (data) => { output += data.toString() })
        rg.stderr.on('data', (data) => { console.error('[ripgrep]', data.toString()) })

        rg.on('close', () => {
            const results: any[] = []
            const lines = output.split('\n')
            for (const line of lines) {
                if (!line.trim()) continue
                try {
                    const json = JSON.parse(line)
                    if (json.type === 'match') {
                        results.push({
                            path: json.data.path.text,
                            line: json.data.line_number,
                            text: json.data.lines.text.trim().slice(0, 500) // 限制长度
                        })
                    }
                } catch {}
            }
            resolve(results)
        })

        rg.on('error', (err) => {
            console.error('[ripgrep] spawn error:', err)
            resolve([])
        })
    })
})

// ==========================================
// File Read/Write (带编码检测)
// ==========================================

// 智能读取文件（自动检测编码）
async function readFileWithEncoding(filePath: string): Promise<string> {
    try {
        const buffer = fs.readFileSync(filePath)
        
        // 检测编码
        const detected = jschardet.detect(buffer)
        const encoding = detected.encoding || 'utf-8'
        
        // 如果是 UTF-8 或 ASCII，直接返回
        if (encoding.toLowerCase() === 'utf-8' || encoding.toLowerCase() === 'ascii') {
            return buffer.toString('utf-8')
        }
        
        // 其他编码使用 iconv-lite 转换
        if (iconv.encodingExists(encoding)) {
            return iconv.decode(buffer, encoding)
        }
        
        // 回退到 UTF-8
        return buffer.toString('utf-8')
    } catch (e) {
        console.error('[File] Read error:', e)
        return ''
    }
}

// 流式读取大文件（避免内存爆炸）
async function readLargeFile(filePath: string, startLine: number = 0, maxLines: number = 1000): Promise<string> {
    return new Promise((resolve, reject) => {
        const lines: string[] = []
        let lineCount = 0
        
        const stream = fs.createReadStream(filePath, { encoding: 'utf-8' })
        let buffer = ''
        
        stream.on('data', (chunk: string | Buffer) => {
            buffer += chunk.toString()
            const parts = buffer.split('\n')
            buffer = parts.pop() || ''
            
            for (const line of parts) {
                if (lineCount >= startLine && lines.length < maxLines) {
                    lines.push(line)
                }
                lineCount++
                
                if (lines.length >= maxLines) {
                    stream.destroy()
                    break
                }
            }
        })
        
        stream.on('end', () => {
            if (buffer && lines.length < maxLines) {
                lines.push(buffer)
            }
            resolve(lines.join('\n'))
        })
        
        stream.on('error', reject)
    })
}

ipcMain.handle('file:read', async (_, filePath: string) => {
    try {
        const stats = fs.statSync(filePath)
        
        // 大文件使用流式读取
        if (stats.size > 5 * 1024 * 1024) { // > 5MB
            console.log('[File] Large file, using stream:', filePath)
            return await readLargeFile(filePath, 0, 10000)
        }
        
        return await readFileWithEncoding(filePath)
    } catch {
        return null
    }
})

ipcMain.handle('file:write', async (_, filePath: string, content: string) => {
    try {
        // 确保目录存在
        const dir = path.dirname(filePath)
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }
        fs.writeFileSync(filePath, content, 'utf-8')
        return true
    } catch {
        return false
    }
})

ipcMain.handle('file:save', async (_, content: string, currentPath?: string) => {
    if (currentPath) {
        fs.writeFileSync(currentPath, content, 'utf-8')
        return currentPath
    }
    const result = await dialog.showSaveDialog(mainWindow!, {
        filters: [{ name: 'All Files', extensions: ['*'] }]
    })
    if (!result.canceled && result.filePath) {
        fs.writeFileSync(result.filePath, content, 'utf-8')
        return result.filePath
    }
    return null
})

ipcMain.handle('file:exists', async (_, filePath: string) => fs.existsSync(filePath))

ipcMain.handle('file:mkdir', async (_, dirPath: string) => {
    try {
        fs.mkdirSync(dirPath, { recursive: true })
        return true
    } catch {
        return false
    }
})

ipcMain.handle('file:delete', async (_, filePath: string) => {
    try {
        const stat = fs.statSync(filePath)
        if (stat.isDirectory()) {
            fs.rmSync(filePath, { recursive: true })
        } else {
            fs.unlinkSync(filePath)
        }
        return true
    } catch {
        return false
    }
})

ipcMain.handle('file:rename', async (_, oldPath: string, newPath: string) => {
    try {
        fs.renameSync(oldPath, newPath)
        return true
    } catch {
        return false
    }
})

// ==========================================
// Settings
// ==========================================

ipcMain.handle('settings:get', (_, key: string) => mainStore.get(key))
ipcMain.handle('settings:set', (_, key: string, value: unknown) => {
    mainStore.set(key, value)
    return true
})

ipcMain.handle('settings:getDataPath', () => mainStore.path)
ipcMain.handle('settings:setDataPath', async (_, newPath: string) => {
    try {
        if (!fs.existsSync(newPath)) throw new Error('Directory does not exist')
        const currentData = mainStore.store
        const newStore = new Store({ cwd: newPath })
        newStore.store = currentData
        bootstrapStore.set('customConfigPath', newPath)
        mainStore = newStore
        return true
    } catch {
        return false
    }
})

// ==========================================
// LLM
// ==========================================

ipcMain.handle('llm:sendMessage', async (_, params) => {
    try {
        await llmService?.sendMessage(params)
    } catch (error: any) {
        throw error
    }
})

ipcMain.on('llm:abort', () => llmService?.abort())


// ==========================================
// Native Terminal (node-pty)
// ==========================================

ipcMain.handle('terminal:create', async (_, options: { id: string; cwd?: string; shell?: string }) => {
    const { id, cwd, shell: customShell } = options
    if (terminals.has(id)) return true

    const isWindows = process.platform === 'win32'
    const defaultShell = isWindows ? 'powershell.exe' : (process.env.SHELL || '/bin/bash')
    const shellToUse = customShell || defaultShell
    const workingDir = cwd || process.cwd()

    try {
        const ptyProcess = pty.spawn(shellToUse, [], {
            name: 'xterm-256color',
            cols: 80,
            rows: 24,
            cwd: workingDir,
            env: process.env as any
        })

        terminals.set(id, ptyProcess)

        ptyProcess.onData((data) => {
            mainWindow?.webContents.send('terminal:data', { id, data })
        })

        ptyProcess.onExit(({ exitCode }) => {
            mainWindow?.webContents.send('terminal:exit', { id, code: exitCode })
            terminals.delete(id)
        })

        return true
    } catch (e) {
        console.error(`[Terminal] Failed to spawn PTY ${id}:`, e)
        return false
    }
})

ipcMain.handle('terminal:input', (_, { id, data }: { id: string; data: string }) => {
    const term = terminals.get(id)
    if (term) term.write(data)
})

ipcMain.handle('terminal:resize', (_, { id, cols, rows }: { id: string; cols: number; rows: number }) => {
    const term = terminals.get(id)
    if (term) term.resize(cols, rows)
})

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

ipcMain.handle('terminal:get-shells', () => {
    if (process.platform === 'win32') {
        return [
            { label: 'PowerShell', path: 'powershell.exe' },
            { label: 'Command Prompt', path: 'cmd.exe' },
            { label: 'Git Bash', path: 'C:\\Program Files\\Git\\bin\\bash.exe' },
            { label: 'WSL', path: 'wsl.exe' }
        ]
    }
    return [
        { label: 'Bash', path: '/bin/bash' },
        { label: 'Zsh', path: '/bin/zsh' }
    ]
})

// ==========================================
// Git Operations (使用 dugite 原生绑定)
// ==========================================

// Git 操作通过 dugite 实现，比 child_process 调用 git CLI 更快
// dugite 是 GitHub Desktop 使用的原生 Git 库

ipcMain.handle('git:exec', async (_, args: string[], cwd: string) => {
    try {
        const { GitProcess } = require('dugite')
        const result = await GitProcess.exec(args, cwd)
        return {
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode
        }
    } catch (e) {
        // 如果 dugite 不可用，回退到 child_process
        return new Promise((resolve) => {
            const { exec } = require('child_process')
            exec(`git ${args.join(' ')}`, { cwd }, (error: any, stdout: string, stderr: string) => {
                resolve({
                    stdout,
                    stderr,
                    exitCode: error ? error.code || 1 : 0
                })
            })
        })
    }
})
