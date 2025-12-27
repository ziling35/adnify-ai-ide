/**
 * InlineDiffPreview - 内联 Diff 预览组件
 * 使用 diff 库（Myers 算法，Git 同款）计算精确的文件差异
 * 支持语法高亮、删除/新增行颜色区分
 */

import React, { useMemo } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import * as Diff from 'diff'

export interface DiffLine {
    type: 'add' | 'remove' | 'unchanged'
    content: string
    oldLineNumber?: number
    newLineNumber?: number
}

interface InlineDiffPreviewProps {
    oldContent: string
    newContent: string
    filePath: string
    isStreaming?: boolean
    maxLines?: number
}

// 根据文件路径推断语言
function getLanguageFromPath(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase()
    const langMap: Record<string, string> = {
        ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
        py: 'python', rs: 'rust', go: 'go', java: 'java',
        cpp: 'cpp', c: 'c', h: 'c', hpp: 'cpp',
        css: 'css', scss: 'scss', less: 'less',
        html: 'html', vue: 'vue', svelte: 'svelte',
        json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
        md: 'markdown', sql: 'sql', sh: 'bash', bash: 'bash',
        xml: 'xml', graphql: 'graphql', prisma: 'prisma',
    }
    return langMap[ext || ''] || 'text'
}

// 使用 diff 库计算行级差异（Myers 算法）
function computeDiff(oldContent: string, newContent: string): DiffLine[] {
    const changes = Diff.diffLines(oldContent, newContent)
    const result: DiffLine[] = []
    
    let oldLineNum = 1
    let newLineNum = 1

    for (const change of changes) {
        const lines = change.value.split('\n')
        // 移除最后一个空行（split 产生的）
        if (lines[lines.length - 1] === '') {
            lines.pop()
        }

        for (const line of lines) {
            if (change.added) {
                result.push({
                    type: 'add',
                    content: line,
                    newLineNumber: newLineNum++
                })
            } else if (change.removed) {
                result.push({
                    type: 'remove',
                    content: line,
                    oldLineNumber: oldLineNum++
                })
            } else {
                result.push({
                    type: 'unchanged',
                    content: line,
                    oldLineNumber: oldLineNum++,
                    newLineNumber: newLineNum++
                })
            }
        }
    }

    return result
}

// 自定义 SyntaxHighlighter 样式
const customStyle = {
    ...oneDark,
    'pre[class*="language-"]': {
        ...oneDark['pre[class*="language-"]'],
        margin: 0,
        padding: 0,
        background: 'transparent',
        fontSize: '11px',
        lineHeight: '1.4',
    },
    'code[class*="language-"]': {
        ...oneDark['code[class*="language-"]'],
        background: 'transparent',
        fontSize: '11px',
    },
}

// 提取单个行组件并使用 React.memo 优化性能
const DiffLineItem = React.memo(({ line, language }: { line: DiffLine, language: string }) => {
    const bgClass = line.type === 'add'
        ? 'bg-green-500/15 border-l-2 border-green-500/50'
        : line.type === 'remove'
            ? 'bg-red-500/15 border-l-2 border-red-500/50'
            : 'border-l-2 border-transparent'

    const symbolClass = line.type === 'add'
        ? 'text-green-400'
        : line.type === 'remove'
            ? 'text-red-400'
            : 'text-text-muted/30'

    const symbol = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '
    const lineNum = line.type === 'remove' ? line.oldLineNumber : line.newLineNumber

    return (
        <div className={`flex ${bgClass} hover:brightness-110 transition-all`}>
            {/* 行号 */}
            <span className="w-8 shrink-0 text-right pr-2 text-text-muted/40 select-none text-[10px]">
                {lineNum || ''}
            </span>

            {/* 符号 */}
            <span className={`w-4 shrink-0 text-center select-none font-bold ${symbolClass}`}>
                {symbol}
            </span>

            {/* 代码内容 */}
            <div className="flex-1 overflow-hidden">
                <SyntaxHighlighter
                    language={language}
                    style={customStyle}
                    customStyle={{
                        margin: 0,
                        padding: 0,
                        background: 'transparent',
                        whiteSpace: 'pre',
                        overflow: 'visible',
                    }}
                    wrapLines={false}
                    PreTag="span"
                    CodeTag="span"
                >
                    {line.content || ' '}
                </SyntaxHighlighter>
            </div>
        </div>
    )
})

DiffLineItem.displayName = 'DiffLineItem'

export default function InlineDiffPreview({
    oldContent,
    newContent,
    filePath,
    isStreaming = false,
    maxLines = 100,
}: InlineDiffPreviewProps) {
    const language = useMemo(() => getLanguageFromPath(filePath), [filePath])

    const diffLines = useMemo(() => {
        return computeDiff(oldContent, newContent)
    }, [oldContent, newContent])

    // 智能过滤：只显示变更行及其上下文
    const displayLines = useMemo(() => {
        // 如果变更不多，直接显示全部
        const changedCount = diffLines.filter(l => l.type !== 'unchanged').length
        if (diffLines.length <= maxLines || changedCount === diffLines.length) {
            return diffLines
        }

        const contextSize = 3 // 上下文行数
        const changedIndices = new Set<number>()

        // 标记所有变更行及其上下文
        diffLines.forEach((line, idx) => {
            if (line.type === 'add' || line.type === 'remove') {
                for (let i = Math.max(0, idx - contextSize); i <= Math.min(diffLines.length - 1, idx + contextSize); i++) {
                    changedIndices.add(i)
                }
            }
        })

        // 构建显示结果，添加省略号
        const result: (DiffLine | { type: 'ellipsis'; count: number })[] = []
        let lastIdx = -1
        const sortedIndices = Array.from(changedIndices).sort((a, b) => a - b)

        for (const idx of sortedIndices) {
            if (lastIdx >= 0 && idx - lastIdx > 1) {
                // 添加省略号，显示跳过的行数
                result.push({ type: 'ellipsis', count: idx - lastIdx - 1 })
            }
            result.push(diffLines[idx])
            lastIdx = idx
        }

        // 如果末尾还有未显示的行
        if (lastIdx < diffLines.length - 1) {
            result.push({ type: 'ellipsis', count: diffLines.length - lastIdx - 1 })
        }

        return result
    }, [diffLines, maxLines])

    if (displayLines.length === 0) {
        return (
            <div className="text-[10px] text-text-muted italic px-2 py-1">
                No changes
            </div>
        )
    }

    return (
        <div className="font-mono text-[11px] leading-relaxed">
            {displayLines.map((line, idx) => {
                if ('count' in line && line.type === 'ellipsis') {
                    return (
                        <div key={`ellipsis-${idx}`} className="text-text-muted/40 text-center py-1 text-[10px] bg-white/5">
                            ··· {line.count} unchanged lines ···
                        </div>
                    )
                }

                return (
                    <DiffLineItem
                        key={`${(line as DiffLine).type}-${idx}-${(line as DiffLine).oldLineNumber || (line as DiffLine).newLineNumber}`}
                        line={line as DiffLine}
                        language={language}
                    />
                )
            })}

            {/* 流式生成指示器 */}
            {isStreaming && (
                <div className="flex items-center gap-1 px-2 py-1 text-[10px] text-accent">
                    <span className="inline-block w-1.5 h-3 bg-accent animate-pulse rounded-sm" />
                    <span className="opacity-70">Generating...</span>
                </div>
            )}
        </div>
    )
}

// 导出统计工具函数 - 使用 diff 库计算准确的统计
export function getDiffStats(oldContent: string, newContent: string): { added: number; removed: number } {
    const changes = Diff.diffLines(oldContent, newContent)
    
    let added = 0
    let removed = 0
    
    for (const change of changes) {
        const lineCount = change.value.split('\n').filter(l => l !== '' || change.value === '\n').length
        // 修正：如果值以换行结尾，减去一个空行
        const actualLines = change.value.endsWith('\n') ? lineCount : lineCount
        
        if (change.added) {
            added += actualLines
        } else if (change.removed) {
            removed += actualLines
        }
    }

    return { added, removed }
}
