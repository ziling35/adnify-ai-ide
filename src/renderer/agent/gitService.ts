/**
 * Git 服务 (使用安全的 Git API)
 * 支持多根目录工作区
 */

export interface GitStatus {
    branch: string
    ahead: number
    behind: number
    staged: GitFileChange[]
    unstaged: GitFileChange[]
    untracked: string[]
}

export interface GitFileChange {
    path: string
    status: 'added' | 'modified' | 'deleted' | 'renamed'
    oldPath?: string
}

export interface GitCommit {
    hash: string
    shortHash: string
    message: string
    author: string
    date: Date
}

interface GitExecResult {
    stdout: string
    stderr: string
    exitCode: number
}

class GitService {
    private primaryWorkspacePath: string | null = null

    setWorkspace(path: string | null) {
        this.primaryWorkspacePath = path
    }

    /**
     * 执行 Git 命令 (使用安全的 gitExecSecure API)
     */
    private async exec(args: string[], rootPath?: string): Promise<GitExecResult> {
        const targetPath = rootPath || this.primaryWorkspacePath
        if (!targetPath) {
            return { stdout: '', stderr: 'No workspace', exitCode: 1 }
        }

        try {
            const result = await window.electronAPI.gitExecSecure(args, targetPath)
            return {
                stdout: result.stdout || '',
                stderr: result.stderr || '',
                exitCode: result.exitCode || 0
            }
        } catch (error: any) {
            return {
                stdout: '',
                stderr: error?.message || 'Git execution failed',
                exitCode: 1
            }
        }
    }

    /**
     * 检查是否是 Git 仓库
     */
    async isGitRepo(rootPath?: string): Promise<boolean> {
        try {
            const result = await this.exec(['rev-parse', '--is-inside-work-tree'], rootPath)
            return result.exitCode === 0
        } catch {
            return false
        }
    }

    /**
     * 获取当前分支
     */
    async getCurrentBranch(rootPath?: string): Promise<string | null> {
        try {
            const result = await this.exec(['branch', '--show-current'], rootPath)
            return result.exitCode === 0 ? result.stdout.trim() : null
        } catch {
            return null
        }
    }

    /**
     * 获取 Git 状态
     */
    async getStatus(rootPath?: string): Promise<GitStatus | null> {
        try {
            // 获取分支信息
            const branchResult = await this.exec(['branch', '--show-current'], rootPath)
            const branch = branchResult.stdout.trim() || 'HEAD'

            // 获取 ahead/behind
            let ahead = 0, behind = 0
            try {
                const aheadBehind = await this.exec(['rev-list', '--left-right', '--count', '@{upstream}...HEAD'], rootPath)
                if (aheadBehind.exitCode === 0) {
                    const parts = aheadBehind.stdout.trim().split(/\s+/)
                    if (parts.length >= 2) {
                        behind = Number(parts[0]) || 0
                        ahead = Number(parts[1]) || 0
                    }
                }
            } catch {
                // 没有上游分支
            }

            // 获取状态 (porcelain v1 格式)
            const statusResult = await this.exec(['status', '--porcelain=v1'], rootPath)

            const staged: GitFileChange[] = []
            const unstaged: GitFileChange[] = []
            const untracked: string[] = []

            if (statusResult.exitCode === 0 && statusResult.stdout) {
                const lines = statusResult.stdout.trim().split('\n').filter(Boolean)

                for (const line of lines) {
                    const indexStatus = line[0]
                    const workTreeStatus = line[1]
                    const filePath = line.slice(3).trim()

                    if (indexStatus === '?' && workTreeStatus === '?') {
                        untracked.push(filePath)
                        continue
                    }

                    if (indexStatus !== ' ' && indexStatus !== '?') {
                        staged.push({
                            path: filePath,
                            status: this.parseStatus(indexStatus),
                        })
                    }

                    if (workTreeStatus !== ' ' && workTreeStatus !== '?') {
                        unstaged.push({
                            path: filePath,
                            status: this.parseStatus(workTreeStatus),
                        })
                    }
                }
            }

            return { branch, ahead, behind, staged, unstaged, untracked }
        } catch {
            return null
        }
    }

    private parseStatus(char: string): GitFileChange['status'] {
        switch (char) {
            case 'A': return 'added'
            case 'M': return 'modified'
            case 'D': return 'deleted'
            case 'R': return 'renamed'
            default: return 'modified'
        }
    }

    /**
     * 获取文件 diff
     */
    async getFileDiff(filePath: string, staged: boolean = false, rootPath?: string): Promise<string | null> {
        try {
            const args = staged
                ? ['diff', '--cached', '--', filePath]
                : ['diff', '--', filePath]
            const result = await this.exec(args, rootPath)
            return result.exitCode === 0 ? result.stdout : null
        } catch {
            return null
        }
    }

    /**
     * 获取 HEAD 版本的文件内容
     */
    async getHeadFileContent(absolutePath: string, rootPath?: string): Promise<string | null> {
        const targetRoot = rootPath || this.primaryWorkspacePath
        if (!targetRoot) return null

        // 转换为相对路径
        let relativePath = absolutePath
        if (absolutePath.startsWith(targetRoot)) {
            relativePath = absolutePath.slice(targetRoot.length)
            if (relativePath.startsWith('/') || relativePath.startsWith('\\')) {
                relativePath = relativePath.slice(1)
            }
        }
        relativePath = relativePath.replace(/\\/g, '/')

        try {
            const result = await this.exec(['show', `HEAD:${relativePath}`], targetRoot)
            return result.exitCode === 0 ? result.stdout : ''
        } catch {
            return ''
        }
    }

    async stageFile(filePath: string, rootPath?: string): Promise<boolean> {
        const result = await this.exec(['add', '--', filePath], rootPath)
        return result.exitCode === 0
    }

    async stageAll(rootPath?: string): Promise<boolean> {
        const result = await this.exec(['add', '-A'], rootPath)
        return result.exitCode === 0
    }

    async unstageFile(filePath: string, rootPath?: string): Promise<boolean> {
        const result = await this.exec(['reset', 'HEAD', '--', filePath], rootPath)
        return result.exitCode === 0
    }

    async discardChanges(filePath: string, rootPath?: string): Promise<boolean> {
        const result = await this.exec(['checkout', '--', filePath], rootPath)
        return result.exitCode === 0
    }

    async getRecentCommits(count: number = 10, rootPath?: string): Promise<GitCommit[]> {
        try {
            const result = await this.exec([
                'log',
                `-${count}`,
                '--pretty=format:%H|%h|%s|%an|%aI'
            ], rootPath)

            if (result.exitCode !== 0 || !result.stdout) return []

            return result.stdout.trim().split('\n').filter(Boolean).map(line => {
                const [hash, shortHash, message, author, dateStr] = line.split('|')
                return {
                    hash,
                    shortHash,
                    message,
                    author,
                    date: new Date(dateStr),
                }
            })
        } catch {
            return []
        }
    }

    async commit(message: string, rootPath?: string): Promise<{ success: boolean; error?: string }> {
        try {
            const result = await this.exec(['commit', '-m', message], rootPath)
            return {
                success: result.exitCode === 0,
                error: result.exitCode !== 0 ? result.stderr || result.stdout : undefined,
            }
        } catch (e: any) {
            return { success: false, error: e.message }
        }
    }

    async init(rootPath?: string): Promise<boolean> {
        const result = await this.exec(['init'], rootPath)
        return result.exitCode === 0
    }

    async pull(rootPath?: string): Promise<{ success: boolean; error?: string }> {
        try {
            const result = await this.exec(['pull'], rootPath)
            return {
                success: result.exitCode === 0,
                error: result.exitCode !== 0 ? result.stderr : undefined,
            }
        } catch (e: any) {
            return { success: false, error: e.message }
        }
    }

    async push(rootPath?: string): Promise<{ success: boolean; error?: string }> {
        try {
            const result = await this.exec(['push'], rootPath)
            return {
                success: result.exitCode === 0,
                error: result.exitCode !== 0 ? result.stderr : undefined,
            }
        } catch (e: any) {
            return { success: false, error: e.message }
        }
    }

    async getBranches(rootPath?: string): Promise<{ name: string; current: boolean; remote: boolean; upstream?: string }[]> {
        try {
            const result = await this.exec(['branch', '-a', '-vv'], rootPath)
            if (result.exitCode !== 0 || !result.stdout) return []

            const branches: { name: string; current: boolean; remote: boolean; upstream?: string }[] = []
            const lines = result.stdout.trim().split('\n').filter(Boolean)

            for (const line of lines) {
                const current = line.startsWith('*')
                const trimmed = line.replace(/^\*?\s+/, '')
                const parts = trimmed.split(/\s+/)
                const name = parts[0]

                const remote = name.startsWith('remotes/')
                const cleanName = remote ? name.replace('remotes/', '') : name

                const upstreamMatch = line.match(/\[([^\]]+)\]/)
                const upstream = upstreamMatch ? upstreamMatch[1].split(':')[0] : undefined

                branches.push({ name: cleanName, current, remote, upstream })
            }

            return branches
        } catch {
            return []
        }
    }

    async checkoutBranch(name: string, rootPath?: string): Promise<{ success: boolean; error?: string }> {
        try {
            const result = await this.exec(['checkout', name], rootPath)
            return {
                success: result.exitCode === 0,
                error: result.exitCode !== 0 ? result.stderr : undefined,
            }
        } catch (e: any) {
            return { success: false, error: e.message }
        }
    }

    async createBranch(name: string, rootPath?: string): Promise<{ success: boolean; error?: string }> {
        try {
            const result = await this.exec(['checkout', '-b', name], rootPath)
            return {
                success: result.exitCode === 0,
                error: result.exitCode !== 0 ? result.stderr : undefined,
            }
        } catch (e: any) {
            return { success: false, error: e.message }
        }
    }

    async stash(message?: string, rootPath?: string): Promise<{ success: boolean; error?: string }> {
        try {
            const args = ['stash', 'push']
            if (message) args.push('-m', message)
            const result = await this.exec(args, rootPath)
            return {
                success: result.exitCode === 0,
                error: result.exitCode !== 0 ? result.stderr : undefined,
            }
        } catch (e: any) {
            return { success: false, error: e.message }
        }
    }

    async stashApply(index: number, rootPath?: string): Promise<{ success: boolean; error?: string }> {
        try {
            const result = await this.exec(['stash', 'apply', `stash@{${index}}`], rootPath)
            return {
                success: result.exitCode === 0,
                error: result.exitCode !== 0 ? result.stderr : undefined,
            }
        } catch (e: any) {
            return { success: false, error: e.message }
        }
    }

    async mergeBranch(name: string, rootPath?: string): Promise<{ success: boolean; error?: string; conflicts?: string[] }> {
        try {
            const result = await this.exec(['merge', name], rootPath)

            if (result.exitCode !== 0) {
                const statusResult = await this.exec(['status', '--porcelain'], rootPath)
                const conflicts = statusResult.stdout
                    .split('\n')
                    .filter(line => line.startsWith('UU') || line.startsWith('AA') || line.startsWith('DD'))
                    .map(line => line.slice(3).trim())

                return {
                    success: false,
                    error: result.stderr || 'Merge conflict',
                    conflicts: conflicts.length > 0 ? conflicts : undefined,
                }
            }

            return { success: true }
        } catch (e: any) {
            return { success: false, error: e.message }
        }
    }

    async getRemotes(rootPath?: string): Promise<{ name: string; url: string; type: 'fetch' | 'push' }[]> {
        try {
            const result = await this.exec(['remote', '-v'], rootPath)
            if (result.exitCode !== 0 || !result.stdout) return []

            const remotes: { name: string; url: string; type: 'fetch' | 'push' }[] = []
            const lines = result.stdout.trim().split('\n').filter(Boolean)

            for (const line of lines) {
                const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/)
                if (match) {
                    remotes.push({
                        name: match[1],
                        url: match[2],
                        type: match[3] as 'fetch' | 'push',
                    })
                }
            }

            return remotes
        } catch {
            return []
        }
    }

    async getStashList(rootPath?: string): Promise<{ index: number; message: string; branch: string }[]> {
        try {
            const result = await this.exec(['stash', 'list'], rootPath)
            if (result.exitCode !== 0 || !result.stdout) return []

            return result.stdout.trim().split('\n').filter(Boolean).map((line, index) => {
                const match = line.match(/^stash@{(\d+)}:\s+(?:On\s+(\S+):\s+)?(.+)$/)
                return {
                    index: match ? parseInt(match[1]) : index,
                    branch: match?.[2] || 'unknown',
                    message: match?.[3] || line,
                }
            })
        } catch {
            return []
        }
    }

    async getFileHistory(filePath: string, count: number = 20, rootPath?: string): Promise<GitCommit[]> {
        try {
            const result = await this.exec([
                'log',
                `-${count}`,
                '--pretty=format:%H|%h|%s|%an|%aI',
                '--follow',
                '--',
                filePath
            ], rootPath)

            if (result.exitCode !== 0 || !result.stdout) return []

            return result.stdout.trim().split('\n').filter(Boolean).map(line => {
                const [hash, shortHash, message, author, dateStr] = line.split('|')
                return {
                    hash,
                    shortHash,
                    message,
                    author,
                    date: new Date(dateStr),
                }
            })
        } catch {
            return []
        }
    }
}

export const gitService = new GitService()
