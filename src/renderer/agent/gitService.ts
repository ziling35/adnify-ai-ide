/**
 * Git 服务 (原生增强版)
 * 优先使用 dugite 原生绑定，回退到 CLI
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
    private workspacePath: string | null = null

    setWorkspace(path: string | null) {
        this.workspacePath = path
    }

    /**
     * 执行 Git 命令 (优先使用原生 dugite)
     */
    private async exec(args: string[]): Promise<GitExecResult> {
        if (!this.workspacePath) {
            return { stdout: '', stderr: 'No workspace', exitCode: 1 }
        }

        // 尝试使用原生 git:exec API
        if ((window as any).electronAPI?.gitExec) {
            return await (window as any).electronAPI.gitExec(args, this.workspacePath)
        }

        // 回退到 shell 执行
        const result = await window.electronAPI.executeCommand(
            `git ${args.join(' ')}`,
            this.workspacePath
        )
        return {
            stdout: result.output,
            stderr: result.errorOutput,
            exitCode: result.exitCode
        }
    }

    /**
     * 检查是否是 Git 仓库
     */
    async isGitRepo(): Promise<boolean> {
        if (!this.workspacePath) return false
        try {
            const result = await this.exec(['rev-parse', '--is-inside-work-tree'])
            return result.exitCode === 0
        } catch {
            return false
        }
    }

    /**
     * 获取当前分支
     */
    async getCurrentBranch(): Promise<string | null> {
        try {
            const result = await this.exec(['branch', '--show-current'])
            return result.exitCode === 0 ? result.stdout.trim() : null
        } catch {
            return null
        }
    }

    /**
     * 获取 Git 状态
     */
    async getStatus(): Promise<GitStatus | null> {
        if (!this.workspacePath) return null

        try {
            // 获取分支信息
            const branchResult = await this.exec(['branch', '--show-current'])
            const branch = branchResult.stdout.trim() || 'HEAD'

            // 获取 ahead/behind
            let ahead = 0, behind = 0
            try {
                const aheadBehind = await this.exec(['rev-list', '--left-right', '--count', '@{upstream}...HEAD'])
                if (aheadBehind.exitCode === 0) {
                    const [b, a] = aheadBehind.stdout.trim().split(/\s+/).map(Number)
                    ahead = a || 0
                    behind = b || 0
                }
            } catch {
                // 没有上游分支
            }

            // 获取状态 (porcelain v1 格式)
            const statusResult = await this.exec(['status', '--porcelain=v1'])

            const staged: GitFileChange[] = []
            const unstaged: GitFileChange[] = []
            const untracked: string[] = []

            if (statusResult.exitCode === 0 && statusResult.stdout) {
                const lines = statusResult.stdout.trim().split('\n').filter(Boolean)

                for (const line of lines) {
                    const indexStatus = line[0]
                    const workTreeStatus = line[1]
                    const filePath = line.slice(3).trim()

                    // 未跟踪文件
                    if (indexStatus === '?' && workTreeStatus === '?') {
                        untracked.push(filePath)
                        continue
                    }

                    // 暂存区变更
                    if (indexStatus !== ' ' && indexStatus !== '?') {
                        staged.push({
                            path: filePath,
                            status: this.parseStatus(indexStatus),
                        })
                    }

                    // 工作区变更
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
    async getFileDiff(filePath: string, staged: boolean = false): Promise<string | null> {
        try {
            const args = staged
                ? ['diff', '--cached', '--', filePath]
                : ['diff', '--', filePath]
            const result = await this.exec(args)
            return result.exitCode === 0 ? result.stdout : null
        } catch {
            return null
        }
    }

    /**
     * 获取 HEAD 版本的文件内容
     */
    async getHeadFileContent(absolutePath: string): Promise<string | null> {
        if (!this.workspacePath) return null

        // 转换为相对路径
        let relativePath = absolutePath
        if (absolutePath.startsWith(this.workspacePath)) {
            relativePath = absolutePath.slice(this.workspacePath.length)
            if (relativePath.startsWith('/') || relativePath.startsWith('\\')) {
                relativePath = relativePath.slice(1)
            }
        }
        // 统一使用正斜杠
        relativePath = relativePath.replace(/\\/g, '/')

        try {
            const result = await this.exec(['show', `HEAD:${relativePath}`])
            return result.exitCode === 0 ? result.stdout : ''
        } catch {
            return ''
        }
    }

    /**
     * 暂存文件
     */
    async stageFile(filePath: string): Promise<boolean> {
        try {
            const result = await this.exec(['add', '--', filePath])
            return result.exitCode === 0
        } catch {
            return false
        }
    }

    /**
     * 暂存所有文件
     */
    async stageAll(): Promise<boolean> {
        try {
            const result = await this.exec(['add', '-A'])
            return result.exitCode === 0
        } catch {
            return false
        }
    }

    /**
     * 取消暂存文件
     */
    async unstageFile(filePath: string): Promise<boolean> {
        try {
            const result = await this.exec(['reset', 'HEAD', '--', filePath])
            return result.exitCode === 0
        } catch {
            return false
        }
    }

    /**
     * 放弃文件更改
     */
    async discardChanges(filePath: string): Promise<boolean> {
        try {
            const result = await this.exec(['checkout', '--', filePath])
            return result.exitCode === 0
        } catch {
            return false
        }
    }

    /**
     * 获取最近提交
     */
    async getRecentCommits(count: number = 10): Promise<GitCommit[]> {
        try {
            const result = await this.exec([
                'log',
                `-${count}`,
                '--pretty=format:%H|%h|%s|%an|%aI'
            ])

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

    /**
     * 提交
     */
    async commit(message: string): Promise<{ success: boolean; error?: string }> {
        try {
            const result = await this.exec(['commit', '-m', message])
            return {
                success: result.exitCode === 0,
                error: result.exitCode !== 0 ? result.stderr || result.stdout : undefined,
            }
        } catch (e: unknown) {
            const err = e as { message?: string }
            return { success: false, error: err.message }
        }
    }

    /**
     * 初始化仓库
     */
    async init(): Promise<boolean> {
        try {
            const result = await this.exec(['init'])
            return result.exitCode === 0
        } catch {
            return false
        }
    }

    /**
     * 拉取
     */
    async pull(): Promise<{ success: boolean; error?: string }> {
        try {
            const result = await this.exec(['pull'])
            return {
                success: result.exitCode === 0,
                error: result.exitCode !== 0 ? result.stderr : undefined,
            }
        } catch (e: unknown) {
            const err = e as { message?: string }
            return { success: false, error: err.message }
        }
    }

    /**
     * 推送
     */
    async push(): Promise<{ success: boolean; error?: string }> {
        try {
            const result = await this.exec(['push'])
            return {
                success: result.exitCode === 0,
                error: result.exitCode !== 0 ? result.stderr : undefined,
            }
        } catch (e: unknown) {
            const err = e as { message?: string }
            return { success: false, error: err.message }
        }
    }
}

export const gitService = new GitService()
