/**
 * 上下文管理服务
 * 智能选择和管理 AI 对话的上下文
 */

import { useStore } from '../store'

export interface FileContext {
	path: string
	content: string
	type: 'active' | 'open' | 'referenced' | 'related'
	relevance: number // 0-1
}

export interface ContextSelection {
	type: 'file' | 'code' | 'folder'
	path: string
	content?: string
	range?: [number, number] // [startLine, endLine]
}

// 上下文限制
const MAX_CONTEXT_CHARS = 50000
const MAX_FILES = 10

/**
 * 解析消息中的 @file 引用
 * 支持格式: @file:path/to/file.ts 或 @path/to/file.ts
 */
export function parseFileReferences(message: string): string[] {
	const refs: string[] = []
	
	// 匹配 @file:path 或 @path 格式
	const regex = /@(?:file:)?([^\s@]+\.[a-zA-Z0-9]+)/g
	let match
	
	while ((match = regex.exec(message)) !== null) {
		refs.push(match[1])
	}
	
	return [...new Set(refs)] // 去重
}

/**
 * 移除消息中的 @file 引用，返回清理后的消息
 */
export function cleanFileReferences(message: string): string {
	return message.replace(/@(?:file:)?[^\s@]+\.[a-zA-Z0-9]+/g, '').trim()
}

/**
 * 获取文件扩展名对应的语言
 */
function getLanguageFromPath(path: string): string {
	const ext = path.split('.').pop()?.toLowerCase() || ''
	const langMap: Record<string, string> = {
		ts: 'typescript',
		tsx: 'typescript',
		js: 'javascript',
		jsx: 'javascript',
		py: 'python',
		rs: 'rust',
		go: 'go',
		java: 'java',
		cpp: 'cpp',
		c: 'c',
		h: 'c',
		hpp: 'cpp',
		css: 'css',
		scss: 'scss',
		less: 'less',
		html: 'html',
		json: 'json',
		yaml: 'yaml',
		yml: 'yaml',
		md: 'markdown',
		sql: 'sql',
		sh: 'bash',
		bash: 'bash',
		zsh: 'bash',
	}
	return langMap[ext] || ext
}

/**
 * 格式化文件内容为上下文字符串
 */
export function formatFileContext(file: FileContext): string {
	const lang = getLanguageFromPath(file.path)
	const lines = file.content.split('\n')
	const lineCount = lines.length
	
	// 如果文件太大，截断并添加提示
	let content = file.content
	if (content.length > 10000) {
		content = content.slice(0, 10000) + '\n\n... (truncated, file has ' + lineCount + ' lines)'
	}
	
	return `**${file.path}** (${lineCount} lines):\n\`\`\`${lang}\n${content}\n\`\`\``
}

export async function formatProjectStructure(rootPath: string): Promise<string> {
    const tree = await window.electronAPI.getFileTree(rootPath, 3) // 限制深度为3
    return `**Project Structure:**\n\`\`\`\n${tree}\n\`\`\``
}

/**
 * 构建上下文字符串
 */
export function buildContextString(files: FileContext[], projectStructure?: string): string {
    let context = '---\n**Context:**\n\n'
    
    if (projectStructure) {
        context += projectStructure + '\n\n'
    }
    
	if (files.length > 0) {
        const sections = files.map(formatFileContext)
	    context += sections.join('\n\n')
    }
    
    return context
}

/**
 * 智能收集上下文
 */
export async function collectContext(
	message: string,
	options?: {
		includeActiveFile?: boolean
		includeOpenFiles?: boolean
        includeProjectStructure?: boolean
		maxChars?: number
	}
): Promise<{
	files: FileContext[]
    projectStructure?: string
	cleanedMessage: string
	totalChars: number
}> {
	const {
		includeActiveFile = true,
		includeOpenFiles = false,
        includeProjectStructure = true,
		maxChars = MAX_CONTEXT_CHARS,
	} = options || {}
	
	const state = useStore.getState()
	const files: FileContext[] = []
	let totalChars = 0
    let projectStructure = ''

    // 0. 获取项目结构
    if (includeProjectStructure && state.workspacePath) {
        projectStructure = await formatProjectStructure(state.workspacePath)
        totalChars += projectStructure.length
    }
	
	// 1. 解析 @file 引用
	const refs = parseFileReferences(message)
	const cleanedMessage = cleanFileReferences(message)
	
	// 2. 加载引用的文件
	for (const ref of refs) {
		if (files.length >= MAX_FILES) break
		
		// 尝试在工作区中查找文件
		let fullPath = ref
		if (state.workspacePath && !ref.startsWith('/') && !ref.includes(':')) {
			fullPath = `${state.workspacePath}/${ref}`
		}
		
		const content = await window.electronAPI.readFile(fullPath)
		if (content && totalChars + content.length <= maxChars) {
			files.push({
				path: ref,
				content,
				type: 'referenced',
				relevance: 1.0,
			})
			totalChars += content.length
		}
	}
	
	// 3. 添加当前活动文件
	if (includeActiveFile && state.activeFilePath) {
		const activeFile = state.openFiles.find(f => f.path === state.activeFilePath)
		if (activeFile && !files.some(f => f.path === activeFile.path)) {
			if (totalChars + activeFile.content.length <= maxChars) {
				files.push({
					path: activeFile.path,
					content: activeFile.content,
					type: 'active',
					relevance: 0.9,
				})
				totalChars += activeFile.content.length
			}
		}
	}
	
	// 4. 添加其他打开的文件（可选）
	if (includeOpenFiles) {
		for (const openFile of state.openFiles) {
			if (files.length >= MAX_FILES) break
			if (files.some(f => f.path === openFile.path)) continue
			if (totalChars + openFile.content.length > maxChars) continue
			
			files.push({
				path: openFile.path,
				content: openFile.content,
				type: 'open',
				relevance: 0.5,
			})
			totalChars += openFile.content.length
		}
	}
	
	// 按相关性排序
	files.sort((a, b) => b.relevance - a.relevance)
	
	return { files, projectStructure, cleanedMessage, totalChars }
}

/**
 * 上下文服务单例
 */
export const contextService = {
	parseFileReferences,
	cleanFileReferences,
	formatFileContext,
    formatProjectStructure,
	buildContextString,
	collectContext,
}
