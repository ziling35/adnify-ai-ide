/**
 * 自定义 Provider 编辑器
 * 
 * 支持新建和编辑自定义 Provider：
 * - 兼容模式（OpenAI/Anthropic/Gemini）
 * - 完全自定义模式
 * 
 * 数据统一存储在 providerConfigs["custom-xxx"] 中
 */

import { useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash, Zap, X, Save, Code2 } from 'lucide-react'
import { Button, Input, Select } from '@components/ui'
import { useStore } from '@store'
import type { AdvancedConfig, ApiProtocol, LLMAdapterConfig } from '@shared/config/providers'
import { BUILTIN_ADAPTERS } from '@shared/config/providers'
import { VENDOR_PRESETS } from '@shared/types/customProviderPresets'
import { toast } from '@components/common/ToastProvider'
import { AdapterOverridesEditor } from '../AdapterOverridesEditor'
import type { ProviderModelConfig } from '@renderer/types/provider'
import { generateCustomProviderId } from '@renderer/types/provider'

interface CustomProviderEditorProps {
  providerId?: string                    // 编辑现有 provider 时传入
  config?: ProviderModelConfig           // 现有配置
  language: 'en' | 'zh'
  onSave: () => void
  onCancel: () => void
  isNew?: boolean
}

const MODE_OPTIONS = [
  { value: 'openai', label: 'OpenAI 兼容' },
  { value: 'anthropic', label: 'Anthropic 兼容' },
  { value: 'gemini', label: 'Gemini 兼容' },
  { value: 'custom', label: '完全自定义' },
]

const VENDOR_OPTIONS = Object.entries(VENDOR_PRESETS).map(([id, preset]) => ({
  value: id,
  label: preset.name || id,
}))

export function CustomProviderEditor({ 
  providerId, 
  config, 
  language, 
  onSave, 
  onCancel, 
  isNew = false 
}: CustomProviderEditorProps) {
  const { setProviderConfig } = useStore()

  // 基础状态
  const [name, setName] = useState(config?.displayName || '')
  const [baseUrl, setBaseUrl] = useState(config?.baseUrl || '')
  const [apiKey, setApiKey] = useState(config?.apiKey || '')
  const [models, setModels] = useState<string[]>(config?.customModels || [])
  const [newModel, setNewModel] = useState('')
  const [mode, setMode] = useState<ApiProtocol>(config?.protocol || 'openai')
  const [timeout, setTimeout] = useState(config?.timeout ? config.timeout / 1000 : 120)
  const [selectedPreset, setSelectedPreset] = useState('')

  // 高级配置
  const [advancedConfig, setAdvancedConfig] = useState<AdvancedConfig | undefined>(config?.advanced)
  const [showCustomConfig, setShowCustomConfig] = useState(false)

  // 从厂商预设加载
  const handleLoadPreset = (presetId: string) => {
    const preset = VENDOR_PRESETS[presetId]
    if (!preset) return
    
    setName(preset.name || presetId)
    setBaseUrl(preset.baseUrl || '')
    setModels(preset.models || [])
    setMode(preset.protocol || 'openai')
    if (preset.defaults?.timeout) {
      setTimeout(preset.defaults.timeout / 1000)
    }
    setSelectedPreset(presetId)

    // 完全自定义模式自动展开配置面板
    if (preset.protocol === 'custom') {
      setShowCustomConfig(true)
    }

    if (preset.adapter) {
      // 从 adapter 配置中提取高级配置
      const adapter = preset.adapter as LLMAdapterConfig
      setAdvancedConfig({
        request: { endpoint: adapter.request?.endpoint, bodyTemplate: adapter.request?.bodyTemplate },
        response: adapter.response ? {
          contentField: adapter.response.contentField,
          reasoningField: adapter.response.reasoningField,
          toolCallField: adapter.response.toolCallField,
          doneMarker: adapter.response.doneMarker,
        } : undefined,
      })
    }
  }

  const handleAddModel = () => {
    const trimmed = newModel.trim()
    if (trimmed && !models.includes(trimmed)) {
      setModels([...models, trimmed])
      setNewModel('')
    }
  }

  // 构建适配器配置
  const buildAdapterConfig = (): LLMAdapterConfig => {
    // 基于模式获取基础适配器
    const baseAdapter = BUILTIN_ADAPTERS[mode] || BUILTIN_ADAPTERS.openai
    
    const adapter: LLMAdapterConfig = {
      ...baseAdapter,
      id: providerId || generateCustomProviderId(),
      name: name,
      description: '自定义适配器',
      protocol: mode,
    }

    // 应用高级配置
    if (advancedConfig) {
      if (advancedConfig.request) {
        adapter.request = {
          ...adapter.request,
          endpoint: advancedConfig.request.endpoint || adapter.request.endpoint,
          headers: { ...adapter.request.headers, ...advancedConfig.request.headers },
          bodyTemplate: advancedConfig.request.bodyTemplate || adapter.request.bodyTemplate,
        }
      }
      if (advancedConfig.response) {
        adapter.response = {
          ...adapter.response,
          ...advancedConfig.response,
        }
      }
      if (advancedConfig.messageFormat) {
        adapter.messageFormat = {
          ...adapter.messageFormat,
          ...advancedConfig.messageFormat,
        } as any
      }
      if (advancedConfig.toolFormat) {
        adapter.toolFormat = {
          ...adapter.toolFormat,
          ...advancedConfig.toolFormat,
        } as any
      }
    }

    return adapter
  }

  const handleSave = () => {
    // 验证
    if (!name.trim()) {
      toast.error(language === 'zh' ? '请输入名称' : 'Name is required')
      return
    }
    if (!baseUrl.trim()) {
      toast.error(language === 'zh' ? '请输入 API URL' : 'API URL is required')
      return
    }
    if (models.length === 0) {
      toast.error(language === 'zh' ? '请添加至少一个模型' : 'At least one model is required')
      return
    }

    const id = providerId || generateCustomProviderId()
    const now = Date.now()

    const newConfig: ProviderModelConfig = {
      displayName: name.trim(),
      baseUrl: baseUrl.trim(),
      apiKey: apiKey || undefined,
      customModels: models,
      protocol: mode,
      timeout: timeout * 1000,
      adapterConfig: buildAdapterConfig(),
      advanced: advancedConfig,
      createdAt: config?.createdAt || now,
      updatedAt: now,
    }

    setProviderConfig(id, newConfig)
    toast.success(language === 'zh' ? '已保存' : 'Saved')
    onSave()
  }

  const isCustomMode = mode === 'custom'

  return (
    <div className="p-4 bg-surface-elevated border border-accent/30 rounded-xl space-y-4 animate-fade-in">
      {/* 快速预设 */}
      {isNew && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-text-secondary flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-yellow-500" />
            {language === 'zh' ? '快速预设' : 'Quick Preset'}
          </label>
          <Select
            value={selectedPreset}
            onChange={handleLoadPreset}
            options={[{ value: '', label: language === 'zh' ? '选择预设...' : 'Select...' }, ...VENDOR_OPTIONS]}
            className="text-sm"
          />
        </div>
      )}

      {/* 基础信息 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">
            {language === 'zh' ? '名称' : 'Name'} *
          </label>
          <Input 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            placeholder="DeepSeek" 
            className="text-sm h-9" 
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">
            {language === 'zh' ? '模式' : 'Mode'} *
          </label>
          <Select 
            value={mode} 
            onChange={(v) => setMode(v as ApiProtocol)} 
            options={MODE_OPTIONS} 
            className="text-sm" 
          />
        </div>
      </div>

      {/* API URL */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-text-secondary">API URL *</label>
        <Input 
          value={baseUrl} 
          onChange={(e) => setBaseUrl(e.target.value)} 
          placeholder="https://api.example.com" 
          className="text-sm h-9" 
        />
      </div>

      {/* API Key */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-text-secondary">API Key</label>
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={language === 'zh' ? '输入 API Key' : 'Enter API Key'}
          className="text-sm h-9"
        />
      </div>

      {/* 模型列表 */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-text-secondary">
          {language === 'zh' ? '模型列表' : 'Models'} *
        </label>
        <div className="flex gap-2">
          <Input
            value={newModel}
            onChange={(e) => setNewModel(e.target.value)}
            placeholder={language === 'zh' ? '添加模型...' : 'Add model...'}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddModel())}
            className="flex-1 text-sm h-9"
          />
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={handleAddModel} 
            disabled={!newModel.trim()} 
            className="h-9 px-3"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        {models.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {models.map((model) => (
              <div 
                key={model} 
                className="flex items-center gap-1 px-2 py-0.5 bg-surface rounded-full border border-border-subtle text-xs"
              >
                <span>{model}</span>
                <button 
                  onClick={() => setModels(models.filter((m) => m !== model))} 
                  className="text-text-muted hover:text-red-400"
                >
                  <Trash className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 完全自定义模式配置 */}
      {isCustomMode && (
        <div className="border border-accent/20 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowCustomConfig(!showCustomConfig)}
            className="w-full flex items-center gap-2 px-4 py-3 bg-accent/5 hover:bg-accent/10 transition-colors"
          >
            {showCustomConfig ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            <Code2 className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium text-text-primary">
              {language === 'zh' ? '完整适配器配置' : 'Full Adapter Configuration'}
            </span>
            <span className="ml-auto text-xs text-accent">
              {language === 'zh' ? '必填' : 'Required'}
            </span>
          </button>
          {showCustomConfig && (
            <div className="p-4 bg-surface/30">
              <AdapterOverridesEditor 
                overrides={advancedConfig} 
                onChange={setAdvancedConfig} 
                language={language} 
                defaultEndpoint="/chat/completions"
                fullCustomMode={true}
              />
            </div>
          )}
        </div>
      )}

      {/* 非自定义模式的高级设置 */}
      {!isCustomMode && (
        <details className="group">
          <summary className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary cursor-pointer">
            {language === 'zh' ? '高级设置' : 'Advanced'}
          </summary>
          <div className="mt-2 pl-4 border-l border-border-subtle">
            <label className="text-xs text-text-secondary">
              {language === 'zh' ? '超时 (秒)' : 'Timeout (sec)'}
            </label>
            <Input 
              type="number" 
              value={timeout} 
              onChange={(e) => setTimeout(parseInt(e.target.value) || 120)} 
              min={30} 
              max={600} 
              className="w-24 text-sm h-8 mt-1" 
            />
          </div>
        </details>
      )}

      {/* 操作按钮 */}
      <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
        <Button variant="ghost" size="sm" onClick={onCancel} className="h-8 px-3">
          <X className="w-4 h-4 mr-1" />
          {language === 'zh' ? '取消' : 'Cancel'}
        </Button>
        <Button size="sm" onClick={handleSave} className="h-8 px-3">
          <Save className="w-4 h-4 mr-1" />
          {language === 'zh' ? '保存' : 'Save'}
        </Button>
      </div>
    </div>
  )
}

// 保持旧名称的导出以兼容
export { CustomProviderEditor as InlineProviderEditor }
