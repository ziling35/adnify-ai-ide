# LLM 配置系统重构设计

## 重构完成

### 已完成的更改

#### 1. 简化类型定义 (`src/shared/config/providers.ts`)
- 新增 `BuiltinProviderDef` 类型：内置 Provider 的完整定义
- 新增 `UserProviderConfig` 类型：用户保存的配置
- 新增 `RuntimeProviderConfig` 类型：运行时合并后的配置
- 新增 `AdvancedConfig` 类型：高级配置（认证、请求、响应覆盖）
- 保留向后兼容的 `PROVIDERS` 和 `AdapterOverrides` 别名

#### 2. 简化 settingsService (`src/renderer/services/settingsService.ts`)
- 简化配置合并逻辑
- 统一处理 `advanced` 和 `adapterOverrides`
- 移除复杂的 adapter 处理逻辑

#### 3. 简化 llmService (`src/main/services/llm/llmService.ts`)
- 简化 Provider 路由逻辑
- 基于 `providerId` 直接路由到对应 Provider
- 移除复杂的 `isBuiltin` 判断

#### 4. 重构 AnthropicProvider (`src/main/services/llm/providers/anthropic.ts`)
- 接收统一的 `LLMConfig` 配置
- 自动处理认证方式：
  - 官方 API: x-api-key
  - 自定义 baseUrl: Bearer token（可通过 advanced.auth 配置）
- 移除调试日志

#### 5. 更新 LLMConfig 类型 (`src/shared/types/llm.ts`)
- 添加 `advanced` 字段支持高级配置

---

## 新的配置流程

```
用户配置 (config.json)
    ↓
settingsService.loadAll()
    ↓ 合并默认值和用户配置
LLMConfig (运行时配置)
    ↓
llmService.getProvider()
    ↓ 基于 providerId 路由
Provider (OpenAI/Anthropic/Gemini/Custom)
```

### Provider 路由规则

| providerId | Provider 实现 | 说明 |
|------------|--------------|------|
| `openai` | OpenAIProvider | 使用 OpenAI SDK |
| `anthropic` | AnthropicProvider | 使用 Anthropic SDK |
| `gemini` | GeminiProvider | 使用 Gemini SDK |
| 其他 | CustomProvider | 使用通用 HTTP 客户端 |

### 认证方式

| Provider | 默认认证 | 自定义 baseUrl 时 |
|----------|---------|------------------|
| OpenAI | Bearer Token | Bearer Token |
| Anthropic | x-api-key | Bearer Token（可配置） |
| Gemini | Bearer Token | Bearer Token |
| Custom | Bearer Token | 可配置 |

---

## 配置示例

### Anthropic 官方 API
```json
{
  "providerConfigs": {
    "anthropic": {
      "apiKey": "sk-ant-xxx"
    }
  }
}
```

### Anthropic 代理（自动使用 Bearer token）
```json
{
  "providerConfigs": {
    "anthropic": {
      "apiKey": "your-proxy-key",
      "baseUrl": "https://your-proxy.com/v1"
    }
  }
}
```

### Anthropic 代理（自定义认证）
```json
{
  "providerConfigs": {
    "anthropic": {
      "apiKey": "your-key",
      "baseUrl": "https://your-proxy.com/v1",
      "advanced": {
        "auth": {
          "type": "header",
          "headerName": "X-Custom-Key"
        }
      }
    }
  }
}
```

### 自定义 Provider
```json
{
  "providerConfigs": {
    "custom-xxx": {
      "apiKey": "your-key",
      "baseUrl": "https://api.example.com",
      "adapterConfig": {
        "id": "custom-xxx",
        "name": "My Provider",
        "request": { ... },
        "response": { ... }
      }
    }
  }
}
```
