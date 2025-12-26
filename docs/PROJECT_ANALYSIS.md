# 项目架构分析报告

## 概述

这是一个 Electron + React + TypeScript 的 AI 编程助手项目（类似 Cursor/Windsurf）。

---

## 🔴 严重问题

### 1. 两套 Store 系统并存（最严重）

**问题**：项目同时使用两套状态管理系统，职责严重重叠：

| 功能 | useStore (chatSlice) | useAgentStore |
|------|---------------------|---------------|
| 消息管理 | `messages: Message[]` | `threads[].messages: ChatMessage[]` |
| 工具调用 | `currentToolCalls: ToolCall[]` | `parts[].toolCall` |
| 检查点 | `checkpoints: Checkpoint[]` | `messageCheckpoints: MessageCheckpoint[]` |
| 待审批 | `pendingToolCall` | `streamState.currentToolCall` |

**影响**：
- 数据不一致风险
- 代码重复
- 维护困难

**建议**：废弃 `chatSlice.ts`，统一使用 `AgentStore`

---

### 2. 设置服务与 Store 逻辑重复

**问题**：
- `settingsService.ts` 和 `settingsSlice.ts` 都有默认值定义和合并逻辑
- `settingsSlice.loadSettings()` 调用 `settingsService.loadAll()` 后又做一次合并

**建议**：
- `settingsSlice` 只负责状态管理
- 所有 I/O 和数据转换委托给 `settingsService`

---

### 3. 类型定义分散

**当前状态**：
```
src/shared/types/llm.ts          - LLM 通信类型 ✅
src/renderer/agent/types.ts      - Agent 类型（已整合，从 shared 重新导出）
src/renderer/types/index.ts      - 也定义了 ContextItem 等
src/renderer/store/slices/chatSlice.ts - 定义了 Message, ToolCall（重复！）
```

**建议**：
- 删除 `chatSlice.ts` 后，类型问题自然解决
- `src/renderer/types/index.ts` 中的 ContextItem 应从 `agent/types.ts` 导入

---

## 🟡 中等问题

### 4. Provider 配置架构复杂

涉及文件：
- `src/shared/config/providers.ts` - PROVIDERS, LLMAdapterConfig
- `src/shared/types/customProvider.ts` - CustomProviderConfig
- `src/renderer/types/provider.ts` - ProviderModelConfig
- `src/renderer/services/settingsService.ts` - ProviderConfig

**建议**：统一到 `src/shared/config/providers.ts`

---

### 5. 日志系统分散

```
src/shared/utils/Logger.ts    ← 应该是唯一的
src/main/utils/Logger.ts      ← 删除
src/renderer/utils/Logger.ts  ← 删除
```

---

### 6. 常量定义分散

```
src/shared/constants.ts           - FILE_LIMITS, SECURITY_DEFAULTS
src/shared/config/agentConfig.ts  - DEFAULT_AGENT_CONFIG（重复部分值）
```

---

## 🟢 已完成的优化

### ✅ 类型统一（Task 3）
- 创建 `src/shared/types/llm.ts` 作为 LLM 类型单一来源
- 区分 `LLMToolCall` (无状态) vs `ToolCall` (有 UI 状态)
- 删除 `src/renderer/agent/tools/types.ts`

### ✅ 删除未使用代码（Task 4）
- 删除 `src/shared/config/promptConfig.ts` - 完全未使用
- 删除 `src/renderer/agent/services/codeApplyService.ts` - 未集成
- 删除 `src/renderer/agent/services/contextService.ts` - 未调用
- 整合 `src/renderer/agent/types.ts` - 从 shared 重新导出通用类型

---

## 📋 重构优先级

### P0 - 立即修复
1. **废弃 chatSlice.ts** - 统一使用 AgentStore
2. **统一日志系统** - 删除重复的 Logger 文件

### P1 - 短期优化
3. **简化设置服务** - 移除重复逻辑
4. **整理 Provider 配置**

### P2 - 长期改进
5. **创建初始化入口** - bootstrap.ts
6. **添加错误边界**

---

## 📁 建议的目录结构

```
src/
├── shared/
│   ├── config/
│   │   ├── providers.ts      # Provider 配置（统一）
│   │   ├── agentConfig.ts    # Agent 配置
│   │   └── index.ts
│   ├── types/
│   │   ├── llm.ts           # LLM 类型
│   │   └── index.ts
│   ├── utils/
│   │   └── Logger.ts        # 唯一的日志系统
│   └── constants.ts
│
├── main/
│   └── services/llm/
│       ├── providers/
│       ├── llmService.ts
│       └── types.ts
│
└── renderer/
    ├── agent/
    │   ├── store/AgentStore.ts  # 唯一的消息状态
    │   ├── services/
    │   ├── tools/
    │   ├── llm/
    │   └── prompts/
    └── store/
        └── slices/
            ├── fileSlice.ts
            ├── settingsSlice.ts
            ├── uiSlice.ts
            ├── themeSlice.ts
            └── logSlice.ts
            # 删除 chatSlice.ts
```

---

## 功能完整性

### 已实现 ✅
- LLM 集成（OpenAI, Anthropic, Gemini, 自定义）
- 工具系统（文件操作、终端、LSP、搜索）
- 代码索引（向量搜索）
- 编辑器（Monaco）
- 多窗口支持
- Checkpoint 系统
- Plan 模式
- @file, @codebase, @web 等上下文引用

### 未完成/未集成 ⚠️
- OAuth 认证（类型定义了但未实现）
- 代码补全（completionService.ts 存在但集成状态不明）
