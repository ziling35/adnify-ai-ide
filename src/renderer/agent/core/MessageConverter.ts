/**
 * 消息转换器
 * 参考 Void/Cursor 的架构，将内部消息格式转换为 LLM API 格式
 * 
 * 架构设计：
 * 1. 内部使用 SimpleLLMMessage 格式存储消息
 * 2. 发送给 LLM 前，根据 provider 类型转换为对应格式
 * 3. OpenAI 格式：assistant 消息带 tool_calls，后跟 tool 结果
 * 4. Anthropic 格式：assistant 消息带 tool_use，user 消息带 tool_result
 */

import { ChatMessage, isUserMessage, isAssistantMessage, isToolResultMessage, MessageContent } from './types'

// ===== 简化的 LLM 消息格式（内部使用）=====

export interface SimpleLLMMessage {
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: MessageContent
  // tool 消息专用
  toolCallId?: string
  toolName?: string
  rawParams?: Record<string, unknown>
}

// ===== OpenAI 格式消息 =====

export interface OpenAIMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: MessageContent | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
  tool_call_id?: string
}

// ===== 转换函数 =====

/**
 * 将 ChatMessage[] 转换为 SimpleLLMMessage[]
 * 过滤掉 checkpoint 等非对话消息
 */
export function chatMessagesToSimple(messages: ChatMessage[]): SimpleLLMMessage[] {
  const result: SimpleLLMMessage[] = []

  for (const msg of messages) {
    if (isUserMessage(msg)) {
      result.push({ role: 'user', content: msg.content })
    } else if (isAssistantMessage(msg)) {
      result.push({
        role: 'assistant',
        content: msg.content || '',
      })
    } else if (isToolResultMessage(msg)) {
      result.push({
        role: 'tool',
        content: msg.content,
        toolCallId: msg.toolCallId,
        toolName: msg.name,
        rawParams: {},
      })
    }
  }

  return result
}

/**
 * 将 SimpleLLMMessage[] 转换为 OpenAI API 格式
 */
export function prepareMessagesForOpenAI(
  messages: SimpleLLMMessage[],
  systemPrompt?: string
): OpenAIMessage[] {
  const result: OpenAIMessage[] = []

  if (systemPrompt) {
    result.push({ role: 'system', content: systemPrompt })
  }

  const toolResultsMap = new Map<number, SimpleLLMMessage[]>()

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (msg.role === 'tool') {
      for (let j = i - 1; j >= 0; j--) {
        if (messages[j].role === 'assistant') {
          if (!toolResultsMap.has(j)) {
            toolResultsMap.set(j, [])
          }
          toolResultsMap.get(j)!.push(msg)
          break
        }
      }
    }
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]

    if (msg.role === 'user') {
      result.push({
        role: 'user',
        content: msg.content,
      })
    } else if (msg.role === 'assistant') {
      const toolResults = toolResultsMap.get(i)

      if (toolResults && toolResults.length > 0) {
        result.push({
          role: 'assistant',
          content: msg.content || null,
          tool_calls: toolResults.map(tr => ({
            id: tr.toolCallId!,
            type: 'function' as const,
            function: {
              name: tr.toolName!,
              arguments: JSON.stringify(tr.rawParams || {}),
            },
          })),
        })

        for (const tr of toolResults) {
          result.push({
            role: 'tool',
            content: tr.content,
            tool_call_id: tr.toolCallId,
          })
        }
      } else {
        result.push({
          role: 'assistant',
          content: msg.content || '',
        })
      }
    }
  }

  return result
}

/**
 * 从 ChatMessage[] 和 AssistantMessage 的 toolCalls 构建完整的 OpenAI 消息
 */
export function buildOpenAIMessages(
  messages: ChatMessage[],
  systemPrompt?: string
): OpenAIMessage[] {
  const result: OpenAIMessage[] = []

  if (systemPrompt) {
    result.push({ role: 'system', content: systemPrompt })
  }

  const toolResultMap = new Map<string, ChatMessage>()
  for (const msg of messages) {
    if (isToolResultMessage(msg) && msg.toolCallId) {
      toolResultMap.set(msg.toolCallId, msg)
    }
  }

  for (const msg of messages) {
    if (isUserMessage(msg)) {
      result.push({
        role: 'user',
        content: msg.content,
      })
    } else if (isAssistantMessage(msg)) {
      const validToolCalls = (msg.toolCalls || []).filter(tc => toolResultMap.has(tc.id))

      if (validToolCalls.length > 0) {
        result.push({
          role: 'assistant',
          content: msg.content || null,
          tool_calls: validToolCalls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments || {}),
            },
          })),
        })

        for (const tc of validToolCalls) {
          const toolResult = toolResultMap.get(tc.id)!
          if (isToolResultMessage(toolResult)) {
            result.push({
              role: 'tool',
              content: toolResult.content,
              tool_call_id: tc.id,
            })
          }
        }
      } else if (msg.content) {
        result.push({
          role: 'assistant',
          content: msg.content,
        })
      }
    }
  }

  return result
}

/**
 * 验证消息序列是否符合 OpenAI API 要求
 */
export function validateOpenAIMessages(messages: OpenAIMessage[]): { valid: boolean; error?: string } {
  if (messages.length === 0) {
    return { valid: false, error: 'No messages' }
  }

  // 注意：最后一条消息可以是普通 assistant 回复（无 tool_calls），这是有效的

  // 检查 tool 消息是否有对应的 tool_call
  const toolCallIds = new Set<string>()
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        toolCallIds.add(tc.id)
      }
    }
  }

  for (const msg of messages) {
    if (msg.role === 'tool' && msg.tool_call_id) {
      if (!toolCallIds.has(msg.tool_call_id)) {
        return { valid: false, error: `Tool message has no matching tool_call: ${msg.tool_call_id}` }
      }
    }
  }

  return { valid: true }
}
