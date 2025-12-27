/**
 * Custom Provider 类型定义
 * 
 * 支持用户自定义添加 LLM 厂商：
 * - 兼容模式：复用内置 Provider (OpenAI/Anthropic/Gemini)
 * - 完全自定义模式：自定义请求体、响应解析、认证方式
 */

// ============================================
// 认证配置
// ============================================

/** 认证类型 */
export type AuthType = 'bearer' | 'api-key' | 'header' | 'query' | 'none'

/** 认证配置 */
export interface AuthConfig {
    /** 认证类型 */
    type: AuthType

    /** 自定义 Header 名称 (type='header' 时) */
    headerName?: string

    /** Header 值模板 (支持 {{apiKey}} 占位符) */
    headerTemplate?: string

    /** Query 参数名 (type='query' 时) */
    queryParam?: string
}

// ============================================
// SSE 配置
// ============================================

/** SSE 解析配置 */
export interface SSEConfig {
    /** SSE data 行前缀 (默认 'data: ') */
    dataPrefix?: string

    /** 流结束标记 (如 '[DONE]' 或 'message_stop') */
    doneMarker: string

    /** 事件类型字段 (Anthropic 用 'type') */
    eventField?: string
}

// ============================================
// 请求配置
// ============================================

/** 请求配置 */
export interface CustomRequestConfig {
    /** API 路径 (如 '/chat/completions') */
    endpoint: string

    /** HTTP 方法 */
    method: 'POST' | 'GET'

    /** 额外请求头 */
    headers?: Record<string, string>

    /** 
     * 请求体模板 (对象形式，支持占位符)
     * 
     * 支持的占位符:
     * - {{model}}: 模型名称
     * - {{messages}}: 消息数组 (已转换格式)
     * - {{tools}}: 工具定义数组
     * - {{max_tokens}}: 最大 token 数
     * - {{stream}}: 是否流式 (默认 true)
     */
    bodyTemplate: Record<string, unknown>

    /** 消息格式转换 (默认 'openai') */
    messageFormat?: 'openai' | 'anthropic'

    /** 工具定义格式 (默认 'openai') */
    toolFormat?: 'openai' | 'anthropic'
}

// ============================================
// 响应解析配置
// ============================================

/** 工具调用模式 */
export type ToolCallMode = 'streaming' | 'complete' | 'xml'

/** XML 工具调用解析配置 */
export interface XMLToolCallConfig {
    /** 标签名 (如 'tool_call') */
    tagName: string

    /** 名称来源: 'name' = 子元素, '@name' = 属性 */
    nameSource: string

    /** 参数标签 (如 'arguments') */
    argsTag: string

    /** 参数格式 */
    argsFormat?: 'json' | 'key-value'
}

/** 流式响应字段配置 */
export interface StreamingFieldConfig {
    /** 
     * 内容字段路径 (相对于 choices[0])
     * 例如 'delta.content' 表示 choices[0].delta.content
     */
    contentField: string

    /** 
     * 推理/思考字段路径 (相对于 choices[0])
     * 例如 'delta.reasoning_content'
     */
    reasoningField?: string

    /** 
     * 工具调用数组字段路径 (相对于 choices[0])
     * 例如 'delta.tool_calls'
     */
    toolCallsField?: string

    /** 工具 ID 字段路径 (相对于单个 tool_call，如 'id') */
    toolIdField?: string

    /** 工具名称路径 (相对于单个 tool_call，如 'function.name') */
    toolNameField?: string

    /** 工具参数路径 (相对于单个 tool_call，如 'function.arguments') */
    toolArgsField?: string

    /** 完成原因字段 (相对于 choices[0]，如 'finish_reason') */
    finishReasonField?: string
}

/** 工具调用解析配置 */
export interface ToolCallParseConfig {
    /** 工具调用模式 */
    mode: ToolCallMode

    /** 参数是否已是对象 (vs JSON 字符串) */
    argsIsObject?: boolean

    /** 自动生成 ID (当响应无 ID 时) */
    autoGenerateId?: boolean

    /** XML 模式配置 */
    xmlConfig?: XMLToolCallConfig
}

/** Usage 统计配置 */
export interface UsageConfig {
    /** Usage 对象路径 (默认 'usage') */
    path?: string

    /** 输入 token 字段 (默认 'prompt_tokens') */
    promptTokensField?: string

    /** 输出 token 字段 (默认 'completion_tokens') */
    completionTokensField?: string
}

/** 响应解析配置 */
export interface CustomResponseConfig {
    /** SSE 解析配置 */
    sseConfig: SSEConfig

    /** 流式响应字段配置 */
    streaming: StreamingFieldConfig

    /** 工具调用解析配置 */
    toolCall: ToolCallParseConfig

    /** Usage 统计配置 */
    usage?: UsageConfig
}

// ============================================
// 完整的自定义 Provider 配置
// ============================================

/** 兼容模式类型 */
export type CompatibleMode = 'openai' | 'anthropic' | 'gemini'

/** Provider 模式 */
export type ProviderMode = CompatibleMode | 'custom'

/** 功能特性 */
export interface ProviderFeatures {
    /** 支持流式响应 (默认 true) */
    streaming?: boolean

    /** 支持 Function Calling (默认 true) */
    tools?: boolean

    /** 支持图片输入 */
    vision?: boolean

    /** 支持推理/思考输出 */
    reasoning?: boolean
}

/** 默认参数 */
export interface ProviderDefaults {
    temperature?: number
    maxTokens?: number
    timeout?: number
}

/** 完全自定义模式配置 */
export interface CustomModeConfig {
    /** 请求配置 */
    request: CustomRequestConfig

    /** 响应解析配置 */
    response: CustomResponseConfig

    /** 认证配置 */
    auth: AuthConfig
}

/**
 * 自定义 Provider 完整配置
 * 
 * 用户添加的自定义 LLM 厂商配置
 */
export interface CustomProviderConfig {
    // ===== 基础信息 =====

    /** 唯一标识符 (如 'my-deepseek') */
    id: string

    /** 显示名称 (如 'DeepSeek') */
    name: string

    /** 描述 */
    description?: string

    // ===== 连接配置 =====

    /** API 基础 URL (如 'https://api.deepseek.com') */
    baseUrl: string

    /** 支持的模型列表 */
    models: string[]

    /** 默认模型 */
    defaultModel?: string

    // ===== 模式配置 =====

    /** 
     * Provider 模式
     * - 'openai' | 'anthropic' | 'gemini': 兼容模式，复用内置 Provider
     * - 'custom': 完全自定义模式
     */
    mode: ProviderMode

    /** 完全自定义模式配置 (仅 mode='custom' 时使用) */
    customConfig?: CustomModeConfig

    // ===== 功能与默认值 =====

    /** 功能特性 */
    features?: ProviderFeatures

    /** 默认参数 */
    defaults?: ProviderDefaults

    // ===== 元信息 =====

    /** 创建时间 */
    createdAt?: number

    /** 更新时间 */
    updatedAt?: number
}

// ============================================
// 预设模板
// ============================================

/** 预设模板 ID */
export type PresetTemplateId = 'openai-compatible' | 'deepseek-compatible' | 'anthropic-compatible' | 'custom-blank'

/** 预设模板 */
export interface PresetTemplate {
    id: PresetTemplateId | string
    name: string
    description: string
    config: Partial<CustomProviderConfig>
    /** 对应的 LLMAdapterConfig 预设（用于快速配置适配器） */
    adapterPreset?: Record<string, unknown>
}

// ============================================
// Store 类型
// ============================================

/** API Key 存储 (与配置分离，安全考虑) */
export interface ProviderApiKey {
    providerId: string
    apiKey: string
}

/** 自定义 Provider Store 状态 */
export interface CustomProviderStore {
    /** 自定义 Provider 配置列表 */
    customProviders: CustomProviderConfig[]

    /** API Keys (敏感信息单独存储) */
    providerApiKeys: ProviderApiKey[]
}

// ============================================
// 辅助类型
// ============================================

/** Provider 列表项 (用于 UI 展示) */
export interface ProviderListItem {
    id: string
    name: string
    description?: string
    isBuiltin: boolean
    mode: ProviderMode
    baseUrl?: string
    hasApiKey: boolean
}

/** 连接测试结果 */
export interface ConnectionTestResult {
    success: boolean
    message: string
    latency?: number
    models?: string[]
}
