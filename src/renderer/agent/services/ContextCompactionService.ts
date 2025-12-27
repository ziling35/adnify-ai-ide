/**
 * 上下文压缩服务
 * 使用 LLM 生成对话摘要，实现智能上下文压缩
 */

import { logger } from '@utils/Logger'
import { useAgentStore } from '../store/AgentStore'
import { ChatMessage } from '../types'
import {
  COMPACT_CONFIG,
  buildCompactPrompt,
  prepareMessagesForCompact,
  calculateSavings,
} from '../utils/ContextCompressor'

// 压缩状态
interface CompactionState {
  isCompacting: boolean
  lastCompactedAt: number | null
  summary: string | null
  compactedMessageCount: number
}

class ContextCompactionServiceClass {
  private state: CompactionState = {
    isCompacting: false,
    lastCompactedAt: null,
    summary: null,
    compactedMessageCount: 0,
  }

  // 压缩请求队列（防止并发压缩）
  private compactionQueue: Promise<string | null> | null = null

  /**
   * 获取当前摘要
   */
  getSummary(): string | null {
    return this.state.summary
  }

  /**
   * 检查是否正在压缩
   */
  isCompacting(): boolean {
    return this.state.isCompacting
  }

  /**
   * 获取压缩统计
   */
  getStats(): { lastCompactedAt: number | null; compactedMessageCount: number } {
    return {
      lastCompactedAt: this.state.lastCompactedAt,
      compactedMessageCount: this.state.compactedMessageCount,
    }
  }

  /**
   * 请求压缩上下文
   * 如果已有压缩任务在进行，返回该任务的结果
   */
  async requestCompaction(messages: ChatMessage[]): Promise<string | null> {
    // 如果已有压缩任务，等待其完成
    if (this.compactionQueue) {
      return this.compactionQueue
    }

    // 创建新的压缩任务
    this.compactionQueue = this.doCompaction(messages)

    try {
      const result = await this.compactionQueue
      return result
    } finally {
      this.compactionQueue = null
    }
  }

  /**
   * 执行压缩
   */
  private async doCompaction(messages: ChatMessage[]): Promise<string | null> {
    if (this.state.isCompacting) {
      logger.agent.warn('[ContextCompaction] Already compacting, skipping')
      return this.state.summary
    }

    const { messagesToCompact, recentMessages: _recentMessages, importantMessages: _importantMessages } = prepareMessagesForCompact(messages)

    // 如果没有需要压缩的消息，直接返回
    if (messagesToCompact.length === 0) {
      return this.state.summary
    }

    this.state.isCompacting = true
    logger.agent.info(`[ContextCompaction] Starting compaction of ${messagesToCompact.length} messages`)

    try {
      // 构建压缩提示词
      const prompt = buildCompactPrompt(messagesToCompact)

      // 调用 LLM 生成摘要
      const summary = await this.callLLMForSummary(prompt)

      if (summary) {
        // 计算节省的 Token
        const savings = calculateSavings(messagesToCompact, summary)
        logger.agent.info(
          `[ContextCompaction] Completed: ${savings.savedTokens} tokens saved (${savings.savedPercent}%)`
        )

        // 更新状态
        this.state.summary = summary
        this.state.lastCompactedAt = Date.now()
        this.state.compactedMessageCount += messagesToCompact.length

        // 保存到 store（用于持久化）
        this.saveSummaryToStore(summary)

        return summary
      }

      return null
    } catch (error) {
      logger.agent.error('[ContextCompaction] Failed:', error)
      return null
    } finally {
      this.state.isCompacting = false
    }
  }

  /**
   * 调用 LLM 生成摘要
   */
  private async callLLMForSummary(prompt: string): Promise<string | null> {
    return new Promise((resolve) => {
      let content = ''
      const unsubscribers: (() => void)[] = []

      const cleanup = () => {
        unsubscribers.forEach(unsub => unsub())
      }

      // 监听流式响应
      unsubscribers.push(
        window.electronAPI.onLLMStream((chunk) => {
          if (chunk.type === 'text' && chunk.content) {
            content += chunk.content
          }
        })
      )

      // 监听完成
      unsubscribers.push(
        window.electronAPI.onLLMDone(() => {
          cleanup()
          // 截断到最大长度
          const truncated = content.length > COMPACT_CONFIG.maxSummaryChars
            ? content.slice(0, COMPACT_CONFIG.maxSummaryChars) + '...'
            : content
          resolve(truncated)
        })
      )

      // 监听错误
      unsubscribers.push(
        window.electronAPI.onLLMError((error) => {
          cleanup()
          logger.agent.error('[ContextCompaction] LLM error:', error)
          resolve(null)
        })
      )

      // 获取当前配置
      const { llmConfig } = (window as any).__STORE__?.getState?.() || {}
      if (!llmConfig?.apiKey) {
        cleanup()
        resolve(null)
        return
      }

      // 发送压缩请求（使用较小的 token 限制）
      window.electronAPI.sendMessage({
        config: {
          ...llmConfig,
          maxTokens: 1000, // 摘要不需要太长
          temperature: 0.3, // 低温度保证一致性
        },
        messages: [
          { role: 'user', content: prompt }
        ],
        tools: [], // 不需要工具
        systemPrompt: 'You are a helpful assistant that summarizes conversations concisely.',
      }).catch((err) => {
        cleanup()
        logger.agent.error('[ContextCompaction] Send error:', err)
        resolve(null)
      })
    })
  }

  /**
   * 保存摘要到 store
   */
  private saveSummaryToStore(summary: string): void {
    const store = useAgentStore.getState() as any
    if (store.setContextSummary) {
      store.setContextSummary(summary)
    }
  }

  /**
   * 从 store 恢复摘要
   */
  restoreFromStore(): void {
    const store = useAgentStore.getState() as any
    if (store.contextSummary) {
      this.state.summary = store.contextSummary
      logger.agent.info('[ContextCompaction] Restored summary from store')
    }
  }

  /**
   * 清除摘要
   */
  clearSummary(): void {
    this.state.summary = null
    this.state.compactedMessageCount = 0
    this.saveSummaryToStore('')
  }

  /**
   * 强制压缩（忽略阈值检查）
   */
  async forceCompaction(messages: ChatMessage[]): Promise<string | null> {
    return this.doCompaction(messages)
  }
}

export const contextCompactionService = new ContextCompactionServiceClass()
