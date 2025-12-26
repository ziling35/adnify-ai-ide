# 系统架构审计报告

## 概述

这是一个 Electron + React + TypeScript 的 AI 编程助手项目。经过全面审计，发现以下问题和优化建议。

---

## 🔴 严重问题

### 1. 两套 Store 系统并存，职责重叠

**问题描述**：
- `src/renderer/store/index.ts` - 全局 Store（useStore），包含 `chatSlice`
- `src/renderer/agent/store/AgentStore.ts` - Agent Store（useAgentStore）

两者都管理聊天消息、工具调用、检查点等状态，导致：
- 数据不一致风险
- 维护困难
- 代码重复

**具体重复**：
```
chatSlice.ts:
- messages: Message[]
- currentToolCalls: ToolCall[]
- checkpoints: Checkpoint[]
- pendingToolCall: ToolCall | null

AgentStore.ts:
- threads[].messages: ChatMessage[]
- threads[].contextItems: ContextItem[]
- pendingChanges: PendingChange[]
- messageCheckpoints: MessageCheckpoint[]
```

**建议**：
- 废弃 `chatSlice.ts`，统一使用 `AgentStore`
- `AgentStore` 已经有完整的消息管理、工具调用、检查点功能
- `chatSlice` 中的 `contextStats` 可以移到 `uiSlice` 或 `AgentStore`

---

### 2. 设置服务与 Store 逻辑重复

**问题描述**：
- `src/renderer/services/settingsService.ts` - 负责加载/保存设置
- `src/renderer/store/slices/settingsSlice.ts` - 也有加载逻辑

`settingsSlice.loadSettings()` 调用 `settingsService.loadAll()`，但两者都有默认值定义和合并逻辑。

**建议**：
- `settingsSlice` 只负责状态管理和 UI 交互
- 所有 I/O 和数据转换逻辑委托给 `settingsService`
- 移除 `settingsSlice` 中的重复默认值定义

---

### 3. 类型定义仍有分散

**问题描述**：
虽然已经创建了 `src/shared/types/llm.ts`，但类型仍分散在：
- `src/renderer/agent/types.ts` - Agent 专用类型
- `src/renderer/types/index.ts` - 也定义了 ContextItem 等
- `src/renderer/store/slices/chatSlice.ts` - 定义了 Message, ToolCall
- `src/main/services/llm/types.ts` - 主进程 LLM 类型

**建议**：
- `src/shared/types/llm.ts` - LLM 通信相关类型
- `src/shared/types/agent.ts` - Agent 相关类型（从 agent/types.ts 移动）
- `src/shared/types/index.ts` - 统一导出
- 删除 `chatSlice.ts` 中的重复类型定义

---

## 🟡 中等问题

### 4. Provider 配置架构复杂

**问题描述**：
Provider 配置涉及多个文件：
- `src/shared/config/providers.ts` - PROVIDERS, LLMAdapterConfig
- `src/shared/types/customProvider.ts` - CustomProviderConfig
- `src/renderer/types/provider.ts` - ProviderModelConfig
- `src/renderer/services/settingsService.ts` - ProviderConfig

**建议**：
- 统一到 `src/shared/config/providers.ts`
- 明确区分：
  - `ProviderDefinition` - 内置 Provider 定义（只读）
  - `ProviderConfig` - 用户配置（可保存）
  - `LLMAdapterConfig` - 适配器配置

---

### 5. 日志系统分散

**问题描述**：
```
src/shared/utils/Logger.ts
src/main/utils/Logger.ts
src/renderer/utils/Logger.ts
```

**建议**：
- 统一到 `src/shared/utils/Logger.ts`
- 主进程和渲染进程使用相同的 Logger 接口
- 删除重复的 Logger 文件

---

### 6. 常量定义分散

**问题描述**：
```
src/shared/constants.ts - FILE_LIMITS, SECURITY_DEFAULTS, AGENT_DEFAULTS
src/shared/config/agentConfig.ts - DEFAULT_AGENT_CONFIG, DEFAULT_TOOL_METADATA
src/renderer/config/editorConfig.ts - 编辑器配置
```

**建议**：
- `src/shared/constants.ts` - 只保留真正的常量（不可配置的值）
- `src/shared/config/` - 所有可配置的默认值
- 避免在多处定义相同的默认值

---

### 7. 服务初始化顺序不明确

**问题描述**：
- `toolRegistry.registerAll()` 需要在使用前调用
- `settingsService.loadAll()` 需要在 Store 初始化后调用
- 没有统一的初始化入口

**建议**：
- 创建 `src/renderer/bootstrap.ts` 统一管理初始化顺序
- 使用依赖注入或服务定位器模式

---

## 🟢 轻微问题

### 8. 未使用的导出

**文件**: `src/renderer/agent/prompts/promptTemplates.ts`
- `PLANNING_TOOLS_DESC` 导出但只在内部使用

**文件**: `src/shared/config/agentConfig.ts`
- 部分辅助函数可能未被使用

**建议**：
- 审查所有导出，移除未使用的
- 使用 `eslint-plugin-unused-imports` 自动检测

---

### 9. 缺少错误边界

**问题描述**：
- Agent 循环中的错误处理不够完善
- 工具执行失败可能导致整个流程中断

**建议**：
- 添加 React Error Boundary
- 工具执行使用 try-catch 包装
- 添加全局错误处理

---

### 10. 性能优化空间

**问题描述**：
- `AgentStore` 使用 `persist` 中间件，每次状态变更都会触发持久化
- 流式响应使用 `requestAnimationFrame` 节流，但仍有优化空间

**建议**：
- 使用 `debounce` 或 `throttle` 减少持久化频率
- 考虑使用 `immer` 优化不可变更新
- 大型状态使用 `zustand/shallow` 选择器

---

## 📋 建议的重构优先级

### P0 - 立即修复
1. **废弃 chatSlice.ts**
   - 将 `contextStats` 移到 `uiSlice`
   - 更新所有引用使用 `AgentStore`
   - 删除 `chatSlice.ts`

2. **统一日志系统**
   - 删除 `src/main/utils/Logger.ts`
   - 删除 `src/renderer/utils/Logger.ts`
   - 统一使用 `src/shared/utils/Logger.ts`

### P1 - 短期优化
3. **整理类型定义**
   - 创建 `src/shared/types/agent.ts`
   - 移动 Agent 相关类型
   - 更新所有导入

4. **简化设置服务**
   - 移除 `settingsSlice` 中的重复逻辑
   - 统一默认值来源

### P2 - 长期改进
5. **Provider 配置重构**
6. **创建初始化入口**
7. **添加错误边界**

---

## 📁 建议的目录结构

```
src/
├── shared/                    # 主进程和渲染进程共享
│   ├── config/               # 配置中心
│   │   ├── providers.ts      # Provider 配置（统一）
│   │   ├── agentConfig.ts    # Agent 配置
│   │   └── index.ts
│   ├── types/                # 共享类型（单一来源）
│   │   ├── llm.ts           # LLM 相关类型
│   │   ├── agent.ts         # Agent 相关类型（新建）
│   │   └── index.ts
│   ├── utils/               # 共享工具
│   │   ├── Logger.ts        # 统一日志（唯一）
│   │   └── ...
│   └── constants.ts         # 真正的常量
│
├── main/                     # 主进程
│   ├── services/llm/        # LLM 服务
│   │   ├── providers/       # Provider 实现
│   │   ├── llmService.ts
│   │   └── types.ts         # 主进程专用类型
│   └── ...
│
└── renderer/                 # 渲染进程
    ├── agent/               # Agent 模块
    │   ├── store/          # AgentStore（唯一的消息状态）
    │   ├── services/       # 服务层
    │   ├── tools/          # 工具系统
    │   ├── llm/            # LLM 通信
    │   ├── prompts/        # 提示词
    │   └── utils/          # 工具函数
    ├── store/              # 全局 Store
    │   └── slices/
    │       ├── fileSlice.ts
    │       ├── settingsSlice.ts
    │       ├── uiSlice.ts      # 包含 contextStats
    │       ├── themeSlice.ts
    │       ├── logSlice.ts
    │       └── customProviderSlice.ts
    │       # 注意：删除 chatSlice.ts
    └── ...
```

---

## 总结

项目整体架构良好，主要问题是：
1. **两套 Store 并存** - 最严重，需要立即解决
2. **类型和配置分散** - 增加维护成本
3. **日志系统重复** - 容易造成混乱

建议按优先级逐步重构，每次只改动一个模块，确保测试通过后再继续。
