/**
 * Composer 服务
 * 支持多文件上下文感知编辑
 * 类似 Cursor 的 Composer 功能
 */

import { useStore } from '../store'

export interface ComposerFile {
  path: string
  content: string
  language: string
  isModified: boolean
  originalContent?: string
}

export interface ComposerContext {
  files: ComposerFile[]
  instructions: string
  relatedFiles: string[]  // 自动检测的相关文件
}

export interface ComposerEdit {
  filePath: string
  originalContent: string
  newContent: string
  description: string
}

export interface ComposerPlan {
  id: string
  description: string
  edits: ComposerEdit[]
  status: 'planning' | 'ready' | 'applying' | 'completed' | 'error'
  createdAt: number
}

// 语言映射
const LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  py: 'python', rs: 'rust', go: 'go', java: 'java',
  cpp: 'cpp', c: 'c', css: 'css', scss: 'scss',
  html: 'html', vue: 'html', svelte: 'html',
  json: 'json', yaml: 'yaml', yml: 'yaml', md: 'markdown',
}

class ComposerService {
  private currentPlan: ComposerPlan | null = null

  /**
   * 分析文件依赖关系
   */
  async analyzeFileDependencies(filePath: string): Promise<string[]> {
    const { workspacePath } = useStore.getState()
    if (!workspacePath) return []

    const content = await window.electronAPI.readFile(filePath)
    if (!content) return []

    const relatedFiles: Set<string> = new Set()
    const ext = filePath.split('.').pop()?.toLowerCase() || ''

    // TypeScript/JavaScript imports
    if (['ts', 'tsx', 'js', 'jsx', 'mjs'].includes(ext)) {
      const importRegex = /(?:import|export).*?from\s+['"]([^'"]+)['"]/g
      const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
      
      let match
      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1]
        if (importPath.startsWith('.')) {
          relatedFiles.add(this.resolveImportPath(filePath, importPath, workspacePath))
        }
      }
      while ((match = requireRegex.exec(content)) !== null) {
        const importPath = match[1]
        if (importPath.startsWith('.')) {
          relatedFiles.add(this.resolveImportPath(filePath, importPath, workspacePath))
        }
      }
    }

    // Python imports
    if (ext === 'py') {
      const fromImportRegex = /from\s+(\S+)\s+import/g
      const importRegex = /^import\s+(\S+)/gm
      
      let match
      while ((match = fromImportRegex.exec(content)) !== null) {
        const modulePath = match[1]
        if (modulePath.startsWith('.')) {
          relatedFiles.add(this.resolvePythonImport(filePath, modulePath, workspacePath))
        }
      }
      while ((match = importRegex.exec(content)) !== null) {
        const modulePath = match[1]
        if (!modulePath.includes('.')) continue
        relatedFiles.add(this.resolvePythonImport(filePath, modulePath, workspacePath))
      }
    }

    // 过滤掉不存在的文件
    const existingFiles: string[] = []
    for (const file of relatedFiles) {
      if (file && await this.fileExists(file)) {
        existingFiles.push(file)
      }
    }

    return existingFiles.slice(0, 10) // 限制最多10个相关文件
  }

  /**
   * 构建 Composer 上下文
   */
  async buildContext(
    selectedFiles: string[],
    instructions: string
  ): Promise<ComposerContext> {
    const files: ComposerFile[] = []
    const relatedFilesSet: Set<string> = new Set()

    // 加载选中的文件
    for (const filePath of selectedFiles) {
      const content = await window.electronAPI.readFile(filePath)
      if (content !== null) {
        const ext = filePath.split('.').pop()?.toLowerCase() || ''
        files.push({
          path: filePath,
          content,
          language: LANGUAGE_MAP[ext] || 'plaintext',
          isModified: false,
        })

        // 分析依赖
        const deps = await this.analyzeFileDependencies(filePath)
        deps.forEach(d => relatedFilesSet.add(d))
      }
    }

    // 移除已选中的文件
    selectedFiles.forEach(f => relatedFilesSet.delete(f))

    return {
      files,
      instructions,
      relatedFiles: Array.from(relatedFilesSet),
    }
  }

  /**
   * 构建 Composer 专用的系统提示
   */
  buildComposerPrompt(context: ComposerContext): string {
    let prompt = `You are an expert code editor assistant working in Composer mode.
You are editing multiple files simultaneously with full context awareness.

## Current Files Being Edited

`
    for (const file of context.files) {
      prompt += `### ${file.path} (${file.language})
\`\`\`${file.language}
${file.content}
\`\`\`

`
    }

    if (context.relatedFiles.length > 0) {
      prompt += `## Related Files (for reference)
${context.relatedFiles.map(f => `- ${f}`).join('\n')}

`
    }

    prompt += `## Instructions
${context.instructions}

## Response Format
For each file you need to modify, respond with:

### FILE: <file_path>
\`\`\`<language>
<complete new file content>
\`\`\`

Important:
1. Output the COMPLETE file content, not just the changes
2. Maintain consistent style with existing code
3. Preserve imports and dependencies
4. Consider how changes in one file affect others
5. If creating a new file, specify the full path
`

    return prompt
  }

  /**
   * 解析 Composer 响应，提取文件编辑
   */
  parseComposerResponse(response: string, originalFiles: ComposerFile[]): ComposerEdit[] {
    const edits: ComposerEdit[] = []
    
    // 匹配 ### FILE: path 格式
    const fileBlockRegex = /###\s*FILE:\s*([^\n]+)\n```(\w+)?\n([\s\S]*?)```/g
    let match

    while ((match = fileBlockRegex.exec(response)) !== null) {
      const filePath = match[1].trim()
      const newContent = match[3].trim()
      
      // 查找原始内容
      const originalFile = originalFiles.find(f => 
        f.path === filePath || f.path.endsWith(filePath) || filePath.endsWith(f.path.split(/[\\/]/).pop() || '')
      )

      edits.push({
        filePath,
        originalContent: originalFile?.content || '',
        newContent,
        description: `Edit ${filePath}`,
      })
    }

    return edits
  }

  /**
   * 创建编辑计划
   */
  createPlan(description: string, edits: ComposerEdit[]): ComposerPlan {
    this.currentPlan = {
      id: crypto.randomUUID(),
      description,
      edits,
      status: 'ready',
      createdAt: Date.now(),
    }
    return this.currentPlan
  }

  /**
   * 应用编辑计划
   */
  async applyPlan(plan: ComposerPlan): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = []
    plan.status = 'applying'

    for (const edit of plan.edits) {
      try {
        const success = await window.electronAPI.writeFile(edit.filePath, edit.newContent)
        if (!success) {
          errors.push(`Failed to write: ${edit.filePath}`)
        }
      } catch (e) {
        errors.push(`Error writing ${edit.filePath}: ${(e as Error).message}`)
      }
    }

    plan.status = errors.length === 0 ? 'completed' : 'error'
    return { success: errors.length === 0, errors }
  }

  /**
   * 获取当前计划
   */
  getCurrentPlan(): ComposerPlan | null {
    return this.currentPlan
  }

  /**
   * 清除当前计划
   */
  clearPlan(): void {
    this.currentPlan = null
  }

  // 辅助方法
  private resolveImportPath(fromFile: string, importPath: string, workspacePath: string): string {
    const sep = workspacePath.includes('\\') ? '\\' : '/'
    const fromDir = fromFile.split(sep).slice(0, -1).join(sep)
    
    // 简单的路径解析
    let resolved = importPath
    if (importPath.startsWith('./')) {
      resolved = `${fromDir}${sep}${importPath.slice(2)}`
    } else if (importPath.startsWith('../')) {
      const parts = fromDir.split(sep)
      let upCount = 0
      let remaining = importPath
      while (remaining.startsWith('../')) {
        upCount++
        remaining = remaining.slice(3)
      }
      resolved = [...parts.slice(0, -upCount), remaining].join(sep)
    }

    // 尝试添加扩展名
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js']
    for (const ext of extensions) {
      const withExt = resolved + ext
      // 返回可能的路径，后续会验证
      if (!resolved.includes('.')) {
        return withExt
      }
    }

    return resolved
  }

  private resolvePythonImport(fromFile: string, modulePath: string, workspacePath: string): string {
    const sep = workspacePath.includes('\\') ? '\\' : '/'
    const fromDir = fromFile.split(sep).slice(0, -1).join(sep)
    
    // 将模块路径转换为文件路径
    const filePath = modulePath.replace(/\./g, sep) + '.py'
    
    if (modulePath.startsWith('.')) {
      return `${fromDir}${sep}${filePath.slice(1)}`
    }
    
    return `${workspacePath}${sep}${filePath}`
  }

  private async fileExists(filePath: string): Promise<boolean> {
    const content = await window.electronAPI.readFile(filePath)
    return content !== null
  }
}

export const composerService = new ComposerService()
