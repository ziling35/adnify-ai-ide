/**
 * 流状态管理 Slice
 * 负责流式响应状态管理
 * 
 * 注意：自动审批设置已移至 settingsSlice (useStore)
 */

import type { StateCreator } from 'zustand'
import type { StreamState, ToolCall } from '../../types'

// ===== 类型定义 =====

export interface StreamSliceState {
    streamState: StreamState
}

export interface StreamActions {
    setStreamState: (state: Partial<StreamState>) => void
    setStreamPhase: (phase: StreamState['phase'], toolCall?: ToolCall, error?: string) => void
}

export type StreamSlice = StreamSliceState & StreamActions

// ===== Slice 创建器 =====

export const createStreamSlice: StateCreator<
    StreamSlice,
    [],
    [],
    StreamSlice
> = (set) => ({
    // 初始状态
    streamState: { phase: 'idle' },

    // 设置流状态
    setStreamState: (newState) => {
        set(state => ({
            streamState: { ...state.streamState, ...newState },
        }))
    },

    // 设置流阶段
    setStreamPhase: (phase, toolCall, error) => {
        set({ streamState: { phase, currentToolCall: toolCall, error } })
    },
})
