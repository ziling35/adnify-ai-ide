/**
 * 统一的 LLM Provider 配置中心
 *
 * 设计原则：
 * 1. 单一数据源：所有 Provider 信息集中管理
 * 2. 简化概念：统一的配置类型
 * 3. 清晰路由：基于 providerId 决定使用哪个 Provider 实现
 */

// ============================================
// 核心类型定义
// ============================================

/** 认证类型 */
export type AuthType = 'bearer' | 'api-key' | 'header' | 'query' | 'none'

/** 认证配置 */
export interface AuthConfig {
  type: AuthType
  headerName?: string // type='header' 时使用
}

/** 请求配置 */
export interface RequestConfig {
  endpoint: string // API 路径 (如 '/chat/completions')
  method: 'POST' | 'GET'
  headers: Record<string, string>
  bodyTemplate: Record<string, unknown>
}

/** 响应解析配置 */
export interface ResponseConfig {
  contentField: string // 内容字段，如 'delta.content'
  reasoningField?: string // 思考字段，如 'delta.reasoning_content'
  toolCallField?: string // 工具调用，如 'delta.tool_calls'
  finishReasonField?: string // 完成原因，如 'finish_reason'
  toolNamePath?: string // 工具名，如 'function.name'
  toolArgsPath?: string // 参数，如 'function.arguments'
  toolIdPath?: string // ID，如 'id'
  argsIsObject?: boolean // 参数是否已是对象
  doneMarker?: string // 流结束标记，如 '[DONE]'
}

/** LLM 适配器配置（用于自定义请求/响应格式） */
export interface LLMAdapterConfig {
  id: string
  name: string
  description?: string
  request: RequestConfig
  response: ResponseConfig
}

/** 高级配置（覆盖默认行为） */
export interface AdvancedConfig {
  auth?: AuthConfig
  request?: Partial<RequestConfig>
  response?: Partial<ResponseConfig>
}

/** LLM 参数 */
export interface LLMParameters {
  maxTokens: number
  temperature: number
  topP: number
}

/** 功能支持声明 */
export interface ProviderFeatures {
  streaming: boolean
  tools: boolean
  vision: boolean
  reasoning?: boolean
}

// ============================================
// Provider 配置类型
// ============================================

/** 内置 Provider 定义 */
export interface BuiltinProviderDef {
  id: string
  name: string
  displayName: string
  description: string
  defaultBaseUrl: string
  defaultModels: string[]
  recommendedModel: string
  adapter: LLMAdapterConfig
  features: ProviderFeatures
  defaults: LLMParameters & { timeout: number }
  auth: {
    type: AuthType
    placeholder: string
    helpUrl?: string
  }
}

/** 用户 Provider 配置（保存到配置文件） */
export interface UserProviderConfig {
  apiKey?: string
  baseUrl?: string
  timeout?: number
  model?: string
  customModels?: string[]
  // 自定义 Provider 需要的适配器配置
  adapterConfig?: LLMAdapterConfig
  // 高级配置（覆盖默认行为）
  advanced?: AdvancedConfig
}

// ============================================
// 内置适配器预设
// ============================================

const OPENAI_ADAPTER: LLMAdapterConfig = {
  id: 'openai',
  name: 'OpenAI',
  description: 'OpenAI API 标准格式',
  request: {
    endpoint: '/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    bodyTemplate: {
      stream: true,
    },
  },
  response: {
    contentField: 'delta.content',
    toolCallField: 'delta.tool_calls',
    toolNamePath: 'function.name',
    toolArgsPath: 'function.arguments',
    toolIdPath: 'id',
    argsIsObject: false,
    finishReasonField: 'finish_reason',
    doneMarker: '[DONE]',
  },
}

const ANTHROPIC_ADAPTER: LLMAdapterConfig = {
  id: 'anthropic',
  name: 'Anthropic',
  description: 'Claude API 格式',
  request: {
    endpoint: '/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    bodyTemplate: {
      stream: true,
    },
  },
  response: {
    contentField: 'delta.text',
    reasoningField: 'thinking',
    toolCallField: 'content_block',
    toolNamePath: 'name',
    toolArgsPath: 'input',
    toolIdPath: 'id',
    argsIsObject: true,
    finishReasonField: 'stop_reason',
    doneMarker: 'message_stop',
  },
}

const GEMINI_ADAPTER: LLMAdapterConfig = {
  id: 'gemini',
  name: 'Google Gemini',
  description: 'Gemini API 格式 (OpenAI 兼容)',
  request: {
    endpoint: '/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    bodyTemplate: {
      stream: true,
    },
  },
  response: {
    contentField: 'delta.content',
    toolCallField: 'delta.tool_calls',
    toolNamePath: 'function.name',
    toolArgsPath: 'function.arguments',
    toolIdPath: 'id',
    argsIsObject: false,
    finishReasonField: 'finish_reason',
    doneMarker: '[DONE]',
  },
}

// ============================================
// 内置 Provider 定义
// ============================================

export const BUILTIN_PROVIDERS: Record<string, BuiltinProviderDef> = {
  openai: {
    id: 'openai',
    name: 'openai',
    displayName: 'OpenAI',
    description: 'GPT-4, GPT-4o, o1 等模型',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o1-mini', 'o3-mini'],
    recommendedModel: 'gpt-4o',
    adapter: OPENAI_ADAPTER,
    features: {
      streaming: true,
      tools: true,
      vision: true,
      reasoning: true,
    },
    defaults: {
      maxTokens: 8192,
      temperature: 0.7,
      topP: 1,
      timeout: 120000,
    },
    auth: {
      type: 'bearer',
      placeholder: 'sk-proj-...',
      helpUrl: 'https://platform.openai.com/api-keys',
    },
  },

  anthropic: {
    id: 'anthropic',
    name: 'anthropic',
    displayName: 'Anthropic',
    description: 'Claude 3.5, Claude 4 等模型',
    defaultBaseUrl: 'https://api.anthropic.com',
    defaultModels: [
      'claude-sonnet-4-20250514',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
    ],
    recommendedModel: 'claude-sonnet-4-20250514',
    adapter: ANTHROPIC_ADAPTER,
    features: {
      streaming: true,
      tools: true,
      vision: true,
      reasoning: true,
    },
    defaults: {
      maxTokens: 8192,
      temperature: 0.7,
      topP: 1,
      timeout: 120000,
    },
    auth: {
      type: 'api-key',
      placeholder: 'sk-ant-...',
      helpUrl: 'https://console.anthropic.com/settings/keys',
    },
  },

  gemini: {
    id: 'gemini',
    name: 'gemini',
    displayName: 'Google Gemini',
    description: 'Gemini Pro, Gemini Flash 等模型',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModels: ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    recommendedModel: 'gemini-2.0-flash-exp',
    adapter: GEMINI_ADAPTER,
    features: {
      streaming: true,
      tools: true,
      vision: true,
    },
    defaults: {
      maxTokens: 8192,
      temperature: 0.7,
      topP: 1,
      timeout: 120000,
    },
    auth: {
      type: 'bearer',
      placeholder: 'AIzaSy...',
      helpUrl: 'https://aistudio.google.com/apikey',
    },
  },
}

// ============================================
// 辅助函数
// ============================================

/** 获取内置 Provider ID 列表 */
export function getBuiltinProviderIds(): string[] {
  return Object.keys(BUILTIN_PROVIDERS)
}

/** 判断是否为内置 Provider */
export function isBuiltinProvider(providerId: string): boolean {
  return providerId in BUILTIN_PROVIDERS
}

/** 获取内置 Provider 定义 */
export function getBuiltinProvider(providerId: string): BuiltinProviderDef | undefined {
  return BUILTIN_PROVIDERS[providerId]
}

/** 获取 Provider 的默认适配器配置 */
export function getAdapterConfig(providerId: string): LLMAdapterConfig {
  const provider = BUILTIN_PROVIDERS[providerId]
  return provider?.adapter || OPENAI_ADAPTER
}

/** 获取所有内置适配器 */
export function getBuiltinAdapters(): LLMAdapterConfig[] {
  return [OPENAI_ADAPTER, ANTHROPIC_ADAPTER, GEMINI_ADAPTER]
}

/** 获取 Provider 的默认模型 */
export function getProviderDefaultModel(providerId: string): string {
  const provider = BUILTIN_PROVIDERS[providerId]
  return provider?.recommendedModel || provider?.defaultModels[0] || ''
}


// ============================================
// UI 组件使用的辅助类型和函数
// ============================================

/** Provider 信息（用于 UI 显示） */
export interface ProviderInfo {
  id: string
  name: string
  displayName: string
  description: string
  models: string[]
  auth: {
    type: string
    placeholder: string
    helpUrl?: string
  }
  endpoint: {
    default: string
  }
  defaults: {
    timeout: number
  }
}

/** 获取所有 Provider 信息（用于 UI） */
export function getProviders(): Record<string, ProviderInfo> {
  const result: Record<string, ProviderInfo> = {}
  for (const [id, def] of Object.entries(BUILTIN_PROVIDERS)) {
    result[id] = {
      id: def.id,
      name: def.name,
      displayName: def.displayName,
      description: def.description,
      models: def.defaultModels,
      auth: {
        type: def.auth.type,
        placeholder: def.auth.placeholder,
        helpUrl: def.auth.helpUrl,
      },
      endpoint: {
        default: def.defaultBaseUrl,
      },
      defaults: {
        timeout: def.defaults.timeout,
      },
    }
  }
  return result
}

/** PROVIDERS 常量（用于 UI 组件） */
export const PROVIDERS = getProviders()
