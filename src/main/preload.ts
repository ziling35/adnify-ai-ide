/**
 * Preload Script
 * 在渲染进程中暴露安全的 API
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

// Type definitions
interface SearchFilesOptions {
	isRegex: boolean
	isCaseSensitive: boolean
	isWholeWord: boolean
	exclude?: string
}

interface SearchFileResult {
	path: string
	line: number
	text: string
}

interface LLMStreamChunk {
	type: 'text' | 'reasoning' | 'error'
	content?: string
	error?: string
}

interface LLMToolCall {
	id: string
	name: string
	arguments: Record<string, unknown>
}

interface LLMError {
	message: string
	code: string
	retryable: boolean
}

interface LLMResult {
	content: string
	reasoning?: string
	toolCalls?: LLMToolCall[]
	usage?: {
		promptTokens: number
		completionTokens: number
		totalTokens: number
	}
}

interface LLMMessage {
	role: 'user' | 'assistant' | 'system' | 'tool'
	content: string
	toolCallId?: string
	toolName?: string
}

interface ToolDefinition {
	name: string
	description: string
	parameters: {
		type: 'object'
		properties: Record<string, {
			type: string
			description: string
			enum?: string[]
		}>
		required?: string[]
	}
}

interface LLMConfig {
	provider: string
	model: string
	apiKey: string
	baseUrl?: string
}

interface LLMSendMessageParams {
	config: LLMConfig
	messages: LLMMessage[]
	tools?: ToolDefinition[]
	systemPrompt?: string
}

// 定义 API 类型
export interface ElectronAPI {
	// Window controls
	minimize: () => void
	maximize: () => void
	close: () => void

	// File operations
	openFile: () => Promise<{ path: string; content: string } | null>
	openFolder: () => Promise<string | null>
	restoreWorkspace: () => Promise<string | null>
	readDir: (path: string) => Promise<{ name: string; path: string; isDirectory: boolean }[]>
    getFileTree: (path: string, maxDepth?: number) => Promise<string>
	readFile: (path: string) => Promise<string | null>
	writeFile: (path: string, content: string) => Promise<boolean>
	saveFile: (content: string, path?: string) => Promise<string | null>
	fileExists: (path: string) => Promise<boolean>
	mkdir: (path: string) => Promise<boolean>
	deleteFile: (path: string) => Promise<boolean>
	renameFile: (oldPath: string, newPath: string) => Promise<boolean>
	searchFiles: (query: string, rootPath: string, options?: SearchFilesOptions) => Promise<SearchFileResult[]>

	// Settings
	getSetting: (key: string) => Promise<unknown>
	setSetting: (key: string, value: unknown) => Promise<boolean>
    getDataPath: () => Promise<string>
    setDataPath: (path: string) => Promise<boolean>

	// LLM
	sendMessage: (params: LLMSendMessageParams) => Promise<void>
	abortMessage: () => void
	onLLMStream: (callback: (data: LLMStreamChunk) => void) => () => void
	onLLMToolCall: (callback: (toolCall: LLMToolCall) => void) => () => void
	onLLMError: (callback: (error: LLMError) => void) => () => void
	onLLMDone: (callback: (data: LLMResult) => void) => () => void

	// Terminal
	createTerminal: (options: { id: string; cwd?: string; shell?: string }) => Promise<boolean>
	writeTerminal: (id: string, data: string) => Promise<void>
	resizeTerminal: (id: string, cols: number, rows: number) => Promise<void>
	killTerminal: (id?: string) => void
	getAvailableShells: () => Promise<{ label: string; path: string }[]>
	onTerminalData: (callback: (event: { id: string; data: string }) => void) => () => void
}

contextBridge.exposeInMainWorld('electronAPI', {
	// Window controls
	minimize: () => ipcRenderer.send('window:minimize'),
	maximize: () => ipcRenderer.send('window:maximize'),
	close: () => ipcRenderer.send('window:close'),

	// File operations
	openFile: () => ipcRenderer.invoke('file:open'),
	openFolder: () => ipcRenderer.invoke('file:openFolder'),
	showOpenDialog: (options: { properties?: string[]; defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => 
		ipcRenderer.invoke('dialog:showOpen', options),
	
	// Git operations (原生 dugite)
	gitExec: (args: string[], cwd: string) => ipcRenderer.invoke('git:exec', args, cwd),
    restoreWorkspace: () => ipcRenderer.invoke('workspace:restore'),
	readDir: (path: string) => ipcRenderer.invoke('file:readDir', path),
    getFileTree: (path: string, maxDepth?: number) => ipcRenderer.invoke('file:getTree', path, maxDepth),
	readFile: (path: string) => ipcRenderer.invoke('file:read', path),
	writeFile: (path: string, content: string) => ipcRenderer.invoke('file:write', path, content),
	saveFile: (content: string, path?: string) => ipcRenderer.invoke('file:save', content, path),
	fileExists: (path: string) => ipcRenderer.invoke('file:exists', path),
	mkdir: (path: string) => ipcRenderer.invoke('file:mkdir', path),
	deleteFile: (path: string) => ipcRenderer.invoke('file:delete', path),
	renameFile: (oldPath: string, newPath: string) => ipcRenderer.invoke('file:rename', oldPath, newPath),
	searchFiles: (query: string, rootPath: string, options?: SearchFilesOptions) => ipcRenderer.invoke('file:search', query, rootPath, options),

	// Settings
	getSetting: (key: string) => ipcRenderer.invoke('settings:get', key),
	setSetting: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
    getDataPath: () => ipcRenderer.invoke('settings:getDataPath'),
    setDataPath: (path: string) => ipcRenderer.invoke('settings:setDataPath', path),

	// LLM
	sendMessage: (params: LLMSendMessageParams) => ipcRenderer.invoke('llm:sendMessage', params),
	abortMessage: () => ipcRenderer.send('llm:abort'),

	onLLMStream: (callback: (data: LLMStreamChunk) => void) => {
		const handler = (_: IpcRendererEvent, data: LLMStreamChunk) => callback(data)
		ipcRenderer.on('llm:stream', handler)
		return () => ipcRenderer.removeListener('llm:stream', handler)
	},

	onLLMToolCall: (callback: (toolCall: LLMToolCall) => void) => {
		const handler = (_: IpcRendererEvent, toolCall: LLMToolCall) => callback(toolCall)
		ipcRenderer.on('llm:toolCall', handler)
		return () => ipcRenderer.removeListener('llm:toolCall', handler)
	},

	onLLMError: (callback: (error: LLMError) => void) => {
		const handler = (_: IpcRendererEvent, error: LLMError) => callback(error)
		ipcRenderer.on('llm:error', handler)
		return () => ipcRenderer.removeListener('llm:error', handler)
	},

	onLLMDone: (callback: (data: LLMResult) => void) => {
		const handler = (_: IpcRendererEvent, data: LLMResult) => callback(data)
		ipcRenderer.on('llm:done', handler)
		return () => ipcRenderer.removeListener('llm:done', handler)
	},

	// Terminal
    createTerminal: (options: { id: string; cwd?: string; shell?: string }) => ipcRenderer.invoke('terminal:create', options),
    writeTerminal: (id: string, data: string) => ipcRenderer.invoke('terminal:input', { id, data }),
    resizeTerminal: (id: string, cols: number, rows: number) => ipcRenderer.invoke('terminal:resize', { id, cols, rows }),
	killTerminal: (id?: string) => ipcRenderer.send('terminal:kill', id),
	getAvailableShells: () => ipcRenderer.invoke('terminal:get-shells'),
    // Background Shell
    executeCommand: (command: string, cwd?: string) => ipcRenderer.invoke('shell:execute', command, cwd),
	onTerminalData: (callback: (event: { id: string; data: string }) => void) => {
		const handler = (_: IpcRendererEvent, event: { id: string; data: string }) => callback(event)
		ipcRenderer.on('terminal:data', handler)
		return () => ipcRenderer.removeListener('terminal:data', handler)
	},
} as ElectronAPI)
