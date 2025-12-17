/**
 * LLM IPC handlers
 */

import { ipcMain, BrowserWindow } from 'electron'
import { LLMService } from '../services/llm'

let llmService: LLMService | null = null

export function registerLLMHandlers(getMainWindow: () => BrowserWindow | null) {
  // 初始化 LLM 服务
  const mainWindow = getMainWindow()
  if (mainWindow) {
    llmService = new LLMService(mainWindow)
  }

  // 发送消息
  ipcMain.handle('llm:sendMessage', async (_, params) => {
    // 确保 LLM 服务已初始化
    const mainWindow = getMainWindow()
    if (!llmService && mainWindow) {
      llmService = new LLMService(mainWindow)
    }
    
    try {
      await llmService?.sendMessage(params)
    } catch (error: any) {
      throw error
    }
  })

  // 中止消息
  ipcMain.on('llm:abort', () => llmService?.abort())
}

// 更新 LLM 服务的窗口引用
export function updateLLMServiceWindow(mainWindow: BrowserWindow) {
  if (llmService) {
    llmService = new LLMService(mainWindow)
  }
}
