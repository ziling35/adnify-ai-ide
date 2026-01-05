/**
 * Custom Provider 预设模板
 * 
 * 提供常用的兼容模式预设配置，方便用户快速添加新厂商
 */

import type { PresetTemplate } from './customProvider'
import type {
  CustomProviderConfig,
  LLMAdapterConfig,
} from '@/shared/config/providers'
import {
  OPENAI_ADAPTER,
  ANTHROPIC_ADAPTER,
  DEEPSEEK_ADAPTER,
  ZHIPU_ADAPTER,
  QWEN_ADAPTER,
  ERNIE_ADAPTER,
  DOUBAO_ADAPTER,
} from '@/shared/config/providers'

// ============================================
// 适配器预设（基于内置适配器扩展）
// ============================================

/** Anthropic Extended Thinking 适配器配置 */
export const ANTHROPIC_THINKING_ADAPTER_PRESET: Partial<LLMAdapterConfig> = {
  ...ANTHROPIC_ADAPTER,
  id: 'anthropic-thinking',
  name: 'Anthropic Extended Thinking',
  request: {
    ...ANTHROPIC_ADAPTER.request,
    bodyTemplate: {
      stream: true,
      thinking: {
        type: 'enabled',
        budget_tokens: 10000,
      },
    },
  },
}

// ============================================
// 预设模板列表
// ============================================

export const PRESET_TEMPLATES: PresetTemplate[] = [
  {
    id: 'openai-compatible',
    name: 'OpenAI 兼容',
    description: '适用于 Groq, Together AI 等 OpenAI 兼容 API',
    config: {
      features: {
        streaming: true,
        tools: true,
        vision: false,
        reasoning: false,
      },
      defaults: {
        temperature: 0.7,
        topP: 1,
        maxTokens: 8192,
        timeout: 120000,
      },
    },
    adapterPreset: OPENAI_ADAPTER,
  },
  {
    id: 'deepseek-native',
    name: 'DeepSeek 原生',
    description: '适用于 DeepSeek API（支持推理）',
    config: {
      features: {
        streaming: true,
        tools: true,
        vision: false,
        reasoning: true,
      },
      defaults: {
        temperature: 0.7,
        topP: 1,
        maxTokens: 8192,
        timeout: 120000,
      },
    },
    adapterPreset: DEEPSEEK_ADAPTER,
  },
  {
    id: 'anthropic-compatible',
    name: 'Anthropic 兼容',
    description: '适用于 AWS Bedrock Claude 等 Anthropic 兼容 API',
    config: {
      features: {
        streaming: true,
        tools: true,
        vision: true,
        reasoning: false,
      },
      defaults: {
        temperature: 0.7,
        topP: 1,
        maxTokens: 8192,
        timeout: 120000,
      },
    },
    adapterPreset: ANTHROPIC_ADAPTER,
  },
  {
    id: 'anthropic-thinking',
    name: 'Anthropic Extended Thinking',
    description: '启用 Claude Extended Thinking 模式，支持深度推理',
    config: {
      features: {
        streaming: true,
        tools: true,
        vision: true,
        reasoning: true,
      },
      defaults: {
        temperature: 1,
        topP: 1,
        maxTokens: 16000,
        timeout: 180000,
      },
    },
    adapterPreset: ANTHROPIC_THINKING_ADAPTER_PRESET,
  },
  {
    id: 'custom-blank',
    name: '完全自定义',
    description: '从零开始配置请求体、响应解析和认证方式',
    config: {
      features: {
        streaming: true,
        tools: true,
      },
      defaults: {
        temperature: 0.7,
        topP: 1,
        maxTokens: 8192,
        timeout: 120000,
      },
    },
    adapterPreset: OPENAI_ADAPTER,
  },
]

// ============================================
// 常用厂商快速配置（使用原生 API）
// ============================================

export const VENDOR_PRESETS: Record<string, Partial<CustomProviderConfig>> = {
  deepseek: {
    name: 'deepseek',
    displayName: 'DeepSeek',
    description: 'DeepSeek V3, R1 等模型',
    baseUrl: 'https://api.deepseek.com',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    defaultModel: 'deepseek-chat',
    protocol: 'custom',
    adapter: DEEPSEEK_ADAPTER,
    features: {
      streaming: true,
      tools: true,
      vision: false,
      reasoning: true,
    },
  },
  groq: {
    name: 'groq',
    displayName: 'Groq',
    description: '超快推理，Llama, Mixtral 等',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
    defaultModel: 'llama-3.3-70b-versatile',
    protocol: 'openai',
    adapter: OPENAI_ADAPTER,
    features: {
      streaming: true,
      tools: true,
      vision: false,
    },
  },
  zhipu: {
    name: 'zhipu',
    displayName: '智谱 GLM',
    description: 'GLM-4, GLM-4.5 系列',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-plus', 'glm-4-air', 'glm-4-flash', 'glm-4-0520'],
    defaultModel: 'glm-4-plus',
    protocol: 'custom',
    adapter: ZHIPU_ADAPTER,
    features: {
      streaming: true,
      tools: true,
      vision: true,
      reasoning: true,
    },
  },
  qwen: {
    name: 'qwen',
    displayName: '阿里通义千问',
    description: 'Qwen 系列 (DashScope 原生 API)',
    baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
    models: ['qwen-plus', 'qwen-turbo', 'qwen-max', 'qwen-long'],
    defaultModel: 'qwen-plus',
    protocol: 'custom',
    adapter: QWEN_ADAPTER,
    features: {
      streaming: true,
      tools: true,
      vision: true,
      reasoning: true,
    },
  },
  ernie: {
    name: 'ernie',
    displayName: '百度文心一言',
    description: 'ERNIE 系列模型',
    baseUrl: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop',
    models: ['ernie-4.0-8k', 'ernie-3.5-8k', 'ernie-speed-8k'],
    defaultModel: 'ernie-4.0-8k',
    protocol: 'custom',
    adapter: ERNIE_ADAPTER,
    features: {
      streaming: true,
      tools: true,
      vision: false,
    },
  },
  doubao: {
    name: 'doubao',
    displayName: '字节豆包',
    description: '火山引擎豆包大模型',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: ['doubao-pro-32k', 'doubao-lite-32k'],
    defaultModel: 'doubao-pro-32k',
    protocol: 'custom',
    adapter: DOUBAO_ADAPTER,
    features: {
      streaming: true,
      tools: true,
      vision: true,
      reasoning: true,
    },
  },
  ollama: {
    name: 'ollama',
    displayName: 'Ollama',
    description: '本地运行开源模型',
    baseUrl: 'http://localhost:11434/v1',
    models: ['llama3.2', 'codellama', 'qwen2.5-coder'],
    defaultModel: 'llama3.2',
    protocol: 'openai',
    adapter: OPENAI_ADAPTER,
    features: {
      streaming: true,
      tools: true,
      vision: false,
    },
    defaults: {
      temperature: 0.7,
      topP: 1,
      maxTokens: 8192,
      timeout: 300000,
    },
  },
  siliconflow: {
    name: 'siliconflow',
    displayName: '硅基流动',
    description: '硅基流动 API',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct'],
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    protocol: 'openai',
    adapter: OPENAI_ADAPTER,
    features: {
      streaming: true,
      tools: true,
    },
  },
  custom: {
    name: 'custom',
    displayName: '完全自定义',
    description: '从零开始配置任意 API',
    baseUrl: '',
    models: [],
    defaultModel: '',
    protocol: 'custom',
    adapter: OPENAI_ADAPTER,
    features: {
      streaming: true,
      tools: true,
    },
  },
}

// ============================================
// 辅助函数
// ============================================

/**
 * 从预设模板创建新的 CustomProviderConfig
 */
export function createFromPreset(
  presetId: string,
  overrides: Partial<CustomProviderConfig>
): CustomProviderConfig {
  const preset = PRESET_TEMPLATES.find((p) => p.id === presetId)
  if (!preset) {
    throw new Error(`Unknown preset: ${presetId}`)
  }

  const now = Date.now()
  return {
    id: overrides.id || `custom-${now}`,
    name: overrides.name || 'new-provider',
    displayName: overrides.displayName || 'New Provider',
    description: overrides.description || '',
    baseUrl: overrides.baseUrl || '',
    models: overrides.models || [],
    defaultModel: overrides.defaultModel || '',
    adapter: (preset.adapterPreset as LLMAdapterConfig) || OPENAI_ADAPTER,
    auth: overrides.auth || { type: 'bearer' },
    isBuiltin: false,
    ...preset.config,
    ...overrides,
    createdAt: now,
    updatedAt: now,
  } as CustomProviderConfig
}

/**
 * 从厂商预设创建新的 CustomProviderConfig
 */
export function createFromVendorPreset(vendorId: string): CustomProviderConfig {
  const preset = VENDOR_PRESETS[vendorId]
  if (!preset) {
    throw new Error(`Unknown vendor: ${vendorId}`)
  }

  const now = Date.now()
  return {
    id: `custom-${vendorId}-${now}`,
    name: preset.name || vendorId,
    displayName: preset.displayName || vendorId,
    description: preset.description || '',
    baseUrl: preset.baseUrl || '',
    models: preset.models || [],
    defaultModel: preset.defaultModel || preset.models?.[0] || '',
    protocol: preset.protocol || 'custom',
    adapter: preset.adapter || OPENAI_ADAPTER,
    features: preset.features || { streaming: true, tools: true, vision: false },
    defaults: preset.defaults || { temperature: 0.7, topP: 1, maxTokens: 8192, timeout: 120000 },
    auth: { type: 'bearer' },
    isBuiltin: false,
    createdAt: now,
    updatedAt: now,
  } as CustomProviderConfig
}

/**
 * 验证 CustomProviderConfig 完整性
 */
export function validateCustomProviderConfig(
  config: Partial<CustomProviderConfig>
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!config.id) errors.push('缺少 ID')
  if (!config.name) errors.push('缺少名称')
  if (!config.baseUrl) errors.push('缺少 API URL')
  if (!config.models?.length) errors.push('至少需要一个模型')

  return { valid: errors.length === 0, errors }
}
