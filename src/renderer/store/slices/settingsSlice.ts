/**
 * 设置相关状态切片
 */
import { StateCreator } from 'zustand'

export type ProviderType = 'openai' | 'anthropic' | 'gemini' | 'custom'

export interface LLMConfig {
  provider: ProviderType
  model: string
  apiKey: string
  baseUrl?: string
  timeout?: number
  maxTokens?: number
}

export interface AutoApproveSettings {
  edits: boolean
  terminal: boolean
  dangerous: boolean
}

export interface SettingsSlice {
  llmConfig: LLMConfig
  language: 'en' | 'zh'
  autoApprove: AutoApproveSettings
  promptTemplateId: string

  setLLMConfig: (config: Partial<LLMConfig>) => void
  setLanguage: (lang: 'en' | 'zh') => void
  setAutoApprove: (settings: Partial<AutoApproveSettings>) => void
  setPromptTemplateId: (id: string) => void
}

const defaultLLMConfig: LLMConfig = {
  provider: 'openai',
  model: 'gpt-4o',
  apiKey: '',
  baseUrl: '',
}

const defaultAutoApprove: AutoApproveSettings = {
  edits: false,
  terminal: false,
  dangerous: false,
}

export const createSettingsSlice: StateCreator<SettingsSlice, [], [], SettingsSlice> = (set) => ({
  llmConfig: defaultLLMConfig,
  language: 'en',
  autoApprove: defaultAutoApprove,
  promptTemplateId: 'default',

  setLLMConfig: (config) =>
    set((state) => ({
      llmConfig: { ...state.llmConfig, ...config },
    })),

  setLanguage: (lang) => set({ language: lang }),

  setAutoApprove: (settings) =>
    set((state) => ({
      autoApprove: { ...state.autoApprove, ...settings },
    })),

  setPromptTemplateId: (id) => set({ promptTemplateId: id }),
})
