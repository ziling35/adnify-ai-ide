/**
 * Search/Replace 工具模块
 * 统一处理 SEARCH/REPLACE 块的解析和应用
 * 
 * 这是唯一的 Search/Replace 实现，所有其他模块应该从这里导入
 */

// Search/Replace 块格式 (Git 风格，LLM 更熟悉)
export const SEARCH_MARKER = '<<<<<<< SEARCH'
export const DIVIDER_MARKER = '======='
export const REPLACE_MARKER = '>>>>>>> REPLACE'

// 兼容旧格式的别名
export const ORIGINAL = SEARCH_MARKER
export const DIVIDER = DIVIDER_MARKER
export const FINAL = REPLACE_MARKER

// ===== 类型定义 =====

export interface SearchReplaceBlock {
    search: string
    replace: string
}

export interface ApplyResult {
    newContent: string
    appliedCount: number
    errors: string[]
}

// ===== 核心函数 =====

/**
 * 解析 Search/Replace 块字符串
 */
export function parseSearchReplaceBlocks(blocksStr: string): SearchReplaceBlock[] {
    const blocks: SearchReplaceBlock[] = []
    const regex = /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/g
    let match

    while ((match = regex.exec(blocksStr)) !== null) {
        blocks.push({
            search: match[1],
            replace: match[2],
        })
    }

    return blocks
}

/**
 * 应用 Search/Replace 块到内容
 * 
 * 支持：
 * 1. 精确匹配
 * 2. 模糊匹配（忽略行尾空白）
 * 3. 缩进不敏感匹配（忽略每行前导空格）
 */
export function applySearchReplaceBlocks(
    content: string,
    blocks: SearchReplaceBlock[]
): ApplyResult {
    // 统一换行符为 \n
    const normalizedContent = content.replace(/\r\n/g, '\n')
    let currentContent = normalizedContent
    let appliedCount = 0
    const errors: string[] = []

    for (const block of blocks) {
        const normalizedSearch = block.search.replace(/\r\n/g, '\n')
        const normalizedReplace = block.replace.replace(/\r\n/g, '\n')

        // 1. 尝试精确匹配
        if (currentContent.includes(normalizedSearch)) {
            currentContent = currentContent.replace(normalizedSearch, normalizedReplace)
            appliedCount++
            continue
        }

        // 2. 尝试模糊匹配（忽略行尾空白）
        const searchLines = normalizedSearch.split('\n')
        const searchLinesTrimmed = searchLines.map(l => l.trimEnd())
        const contentLines = currentContent.split('\n')
        let found = false

        for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
            const slice = contentLines.slice(i, i + searchLines.length)
            const sliceTrimmed = slice.map(l => l.trimEnd())

            if (sliceTrimmed.join('\n') === searchLinesTrimmed.join('\n')) {
                contentLines.splice(i, searchLines.length, ...normalizedReplace.split('\n'))
                currentContent = contentLines.join('\n')
                appliedCount++
                found = true
                break
            }
        }

        if (found) continue

        // 3. 尝试缩进不敏感匹配（忽略前导空格）
        const searchLinesNoIndent = searchLines.map(l => l.trim())

        for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
            const slice = contentLines.slice(i, i + searchLines.length)
            const sliceNoIndent = slice.map(l => l.trim())

            if (sliceNoIndent.join('\n') === searchLinesNoIndent.join('\n')) {
                // 找到匹配，但需要保留原始缩进（如果可能）
                // 这是一个简化的实现：我们直接替换，因为 LLM 通常会提供正确的缩进在 REPLACE 块中
                contentLines.splice(i, searchLines.length, ...normalizedReplace.split('\n'))
                currentContent = contentLines.join('\n')
                appliedCount++
                found = true
                break
            }
        }

        if (!found) {
            const preview = normalizedSearch.trim().slice(0, 100)
            errors.push(`Search block not found (even with fuzzy matching):\n"${preview}${normalizedSearch.length > 100 ? '...' : ''}"`)
        }
    }

    return { newContent: currentContent, appliedCount, errors }
}

/**
 * 计算两个文本之间的行数变化
 * 使用简单的 LCS 算法计算实际增加和删除的行数
 */
export function calculateLineChanges(
    oldContent: string,
    newContent: string
): { added: number; removed: number } {
    const oldLines = oldContent.split('\n')
    const newLines = newContent.split('\n')

    // 构建简单的 LCS 长度矩阵
    const m = oldLines.length
    const n = newLines.length
    const dp: number[][] = Array(m + 1)
        .fill(null)
        .map(() => Array(n + 1).fill(0))

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (oldLines[i - 1] === newLines[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
            }
        }
    }

    const commonLines = dp[m][n]
    const removed = m - commonLines
    const added = n - commonLines

    return { added, removed }
}
