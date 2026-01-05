/**
 * 消息格式适配器
 * 
 * 将统一的 LLMMessage 格式转换为各协议的消息格式
 */

import type { LLMMessage, MessageContent } from '@/shared/types'
import type { LLMAdapterConfig, ApiProtocol } from '@/shared/config/providers'
import type { OpenAIMessage, AnthropicMessage, AnthropicContentBlock, ConvertedRequest } from './types'

/**
 * 消息适配器
 */
export class MessageAdapter {
  /**
   * 转换消息为目标协议格式
   */
  static convert(
    messages: LLMMessage[],
    systemPrompt: string | undefined,
    protocol: ApiProtocol,
    config?: LLMAdapterConfig
  ): ConvertedRequest {
    switch (protocol) {
      case 'anthropic':
        return this.convertToAnthropic(messages, systemPrompt)
      case 'custom':
        return this.convertToCustom(messages, systemPrompt, config)
      case 'openai':
      case 'gemini':
      default:
        return this.convertToOpenAI(messages, systemPrompt, config)
    }
  }

  /**
   * 转换为 OpenAI 格式
   */
  private static convertToOpenAI(
    messages: LLMMessage[],
    systemPrompt: string | undefined,
    config?: LLMAdapterConfig
  ): ConvertedRequest {
    const result: OpenAIMessage[] = []

    // 系统消息处理
    const systemMode = config?.messageFormat?.systemMessageMode || 'message'
    let pendingSystemContent = systemPrompt || ''

    // 收集消息中的系统消息
    for (const msg of messages) {
      if (msg.role === 'system') {
        const content = this.extractTextContent(msg.content)
        pendingSystemContent = pendingSystemContent
          ? `${pendingSystemContent}\n\n${content}`
          : content
      }
    }

    // 根据模式处理系统消息
    if (pendingSystemContent) {
      if (systemMode === 'message') {
        result.push({ role: 'system', content: pendingSystemContent })
      }
      // 'parameter' 和 'first-user' 模式在后面处理
    }

    // 转换其他消息
    let firstUserProcessed = false
    for (const msg of messages) {
      if (msg.role === 'system') continue // 已处理

      if (msg.role === 'user') {
        let content = this.convertContent(msg.content)
        
        // first-user 模式：将系统消息合并到第一条用户消息
        if (systemMode === 'first-user' && pendingSystemContent && !firstUserProcessed) {
          if (typeof content === 'string') {
            content = `${pendingSystemContent}\n\n${content}`
          }
          firstUserProcessed = true
        }
        
        result.push({ role: 'user', content })
      } else if (msg.role === 'assistant') {
        const assistantMsg: OpenAIMessage = {
          role: 'assistant',
          content: this.extractTextContent(msg.content),
        }

        // 处理工具调用
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          assistantMsg.tool_calls = msg.tool_calls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          }))
        }

        result.push(assistantMsg)
      } else if (msg.role === 'tool') {
        const toolCallId = msg.tool_call_id || msg.toolCallId
        if (toolCallId) {
          result.push({
            role: 'tool',
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
            tool_call_id: toolCallId,
          })
        }
      }
    }

    return {
      messages: result,
      systemPrompt: systemMode === 'parameter' ? pendingSystemContent : undefined,
    }
  }

  /**
   * 转换为自定义协议格式
   * 根据 messageFormat 配置灵活处理
   */
  private static convertToCustom(
    messages: LLMMessage[],
    systemPrompt: string | undefined,
    config?: LLMAdapterConfig
  ): ConvertedRequest {
    const messageFormat = config?.messageFormat
    const result: Array<Record<string, unknown>> = []

    // 系统消息处理
    const systemMode = messageFormat?.systemMessageMode || 'message'
    let pendingSystemContent = systemPrompt || ''

    // 收集消息中的系统消息
    for (const msg of messages) {
      if (msg.role === 'system') {
        const content = this.extractTextContent(msg.content)
        pendingSystemContent = pendingSystemContent
          ? `${pendingSystemContent}\n\n${content}`
          : content
      }
    }

    // 根据模式处理系统消息
    if (pendingSystemContent && systemMode === 'message') {
      result.push({ role: 'system', content: pendingSystemContent })
    }

    // 工具结果配置
    const toolResultRole = messageFormat?.toolResultRole || 'tool'
    const toolResultIdField = messageFormat?.toolResultIdField || 'tool_call_id'
    const toolResultWrapper = messageFormat?.toolResultWrapper

    // 转换其他消息
    let firstUserProcessed = false
    for (const msg of messages) {
      if (msg.role === 'system') continue

      if (msg.role === 'user') {
        let content: string | Array<Record<string, unknown>> = this.convertContent(msg.content) as string | Array<Record<string, unknown>>
        
        // first-user 模式
        if (systemMode === 'first-user' && pendingSystemContent && !firstUserProcessed) {
          if (typeof content === 'string') {
            content = `${pendingSystemContent}\n\n${content}`
          }
          firstUserProcessed = true
        }
        
        result.push({ role: 'user', content })
      } else if (msg.role === 'assistant') {
        const assistantMsg: Record<string, unknown> = {
          role: 'assistant',
          content: this.extractTextContent(msg.content),
        }

        // 处理工具调用
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          const toolCallField = messageFormat?.assistantToolCallField || 'tool_calls'
          assistantMsg[toolCallField] = msg.tool_calls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          }))
        }

        result.push(assistantMsg)
      } else if (msg.role === 'tool') {
        const toolCallId = msg.tool_call_id || msg.toolCallId
        const toolContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)

        if (toolResultWrapper) {
          // Anthropic 风格：包装在 content 数组中
          result.push({
            role: toolResultRole,
            content: [{
              type: toolResultWrapper,
              [toolResultIdField]: toolCallId,
              content: toolContent,
            }],
          })
        } else if (toolResultRole === 'function') {
          // 百度 ERNIE 风格
          result.push({
            role: 'function',
            name: msg.toolName || toolCallId,
            content: toolContent,
          })
        } else {
          // OpenAI 风格
          result.push({
            role: toolResultRole,
            content: toolContent,
            [toolResultIdField]: toolCallId,
          })
        }
      }
    }

    return {
      messages: result,
      systemPrompt: systemMode === 'parameter' ? pendingSystemContent : undefined,
    }
  }

  /**
   * 转换为 Anthropic 格式
   */
  private static convertToAnthropic(
    messages: LLMMessage[],
    systemPrompt: string | undefined
  ): ConvertedRequest {
    const result: AnthropicMessage[] = []
    let systemContent = systemPrompt || ''

    // 收集系统消息
    for (const msg of messages) {
      if (msg.role === 'system') {
        const content = this.extractTextContent(msg.content)
        systemContent = systemContent ? `${systemContent}\n\n${content}` : content
      }
    }

    // 转换其他消息
    for (const msg of messages) {
      if (msg.role === 'system') continue

      if (msg.role === 'user') {
        result.push({
          role: 'user',
          content: this.convertContentToAnthropic(msg.content),
        })
      } else if (msg.role === 'assistant') {
        const contentBlocks: AnthropicContentBlock[] = []

        // 文本内容
        const textContent = this.extractTextContent(msg.content)
        if (textContent) {
          contentBlocks.push({ type: 'text', text: textContent })
        }

        // 工具调用（OpenAI 格式转 Anthropic 格式）
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          for (const tc of msg.tool_calls) {
            let input: Record<string, unknown> = {}
            try {
              input = JSON.parse(tc.function.arguments || '{}')
            } catch {
              // 忽略解析错误
            }
            contentBlocks.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input,
            })
          }
        }

        // 旧格式的工具调用
        if (msg.toolName && msg.toolCallId) {
          let input: Record<string, unknown> = {}
          const contentStr = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
          try {
            input = JSON.parse(contentStr || '{}')
          } catch {
            // 忽略解析错误
          }
          contentBlocks.push({
            type: 'tool_use',
            id: msg.toolCallId,
            name: msg.toolName,
            input,
          })
        }

        if (contentBlocks.length > 0) {
          result.push({ role: 'assistant', content: contentBlocks })
        }
      } else if (msg.role === 'tool') {
        // Anthropic 的工具结果是 user 消息中的 tool_result 块
        const toolCallId = msg.tool_call_id || msg.toolCallId
        if (toolCallId) {
          result.push({
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: toolCallId,
              content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
            }],
          })
        }
      }
    }

    // Anthropic 的 system 是数组格式
    const systemArray = systemContent ? [{ type: 'text', text: systemContent }] : undefined

    return {
      messages: result,
      systemPrompt: systemArray,
    }
  }

  /**
   * 转换内容为 OpenAI 格式
   */
  private static convertContent(
    content: MessageContent
  ): string | Array<{ type: string; text?: string; image_url?: { url: string } }> {
    if (typeof content === 'string') return content
    if (!content?.length) return ''

    return content.map(part => {
      if (part.type === 'text') {
        return { type: 'text', text: part.text ?? '' }
      }
      // 图片
      const url = part.source.type === 'base64'
        ? `data:${part.source.media_type};base64,${part.source.data}`
        : part.source.data
      return { type: 'image_url', image_url: { url } }
    })
  }

  /**
   * 转换内容为 Anthropic 格式
   */
  private static convertContentToAnthropic(
    content: MessageContent
  ): string | AnthropicContentBlock[] {
    if (typeof content === 'string') return content
    if (!content?.length) return ''

    return content.map(part => {
      if (part.type === 'text') {
        return { type: 'text' as const, text: part.text ?? '' }
      }
      // 图片
      if (part.source.type === 'base64') {
        return {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: part.source.media_type,
            data: part.source.data,
          },
        }
      }
      // URL 图片不支持，转为文本提示
      return { type: 'text' as const, text: '[Image URL not supported]' }
    })
  }

  /**
   * 提取文本内容
   */
  private static extractTextContent(content: MessageContent): string {
    if (typeof content === 'string') return content
    if (!content?.length) return ''
    return content
      .filter(p => p.type === 'text')
      .map(p => (p as { type: 'text'; text: string }).text)
      .join('')
  }
}
