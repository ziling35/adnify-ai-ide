/**
 * 共享常量配置
 * 集中管理所有硬编码值，实现定制化
 */

// ==========================================
// 文件和搜索限制（原 prompts.ts 硬编码）
// ==========================================

export const FILE_LIMITS = {
    /** 单个文件最大字符数 */
    MAX_FILE_CHARS: 60000,
    /** 目录列表最大条目数 */
    MAX_DIR_ITEMS: 150,
    /** 搜索结果最大数量 */
    MAX_SEARCH_RESULTS: 30,
    /** 终端输出最大字符数 */
    MAX_TERMINAL_OUTPUT: 3000,
    /** AI 上下文最大字符数 */
    MAX_CONTEXT_CHARS: 30000,
} as const

// ==========================================
// 布局限制（原 App.tsx 硬编码）
// ==========================================

export const LAYOUT_LIMITS = {
    /** ActivityBar 宽度 */
    ACTIVITY_BAR_WIDTH: 48,
    /** 侧边栏最小宽度 */
    SIDEBAR_MIN_WIDTH: 150,
    /** 侧边栏最大宽度 */
    SIDEBAR_MAX_WIDTH: 600,
    /** 聊天面板最小宽度 */
    CHAT_MIN_WIDTH: 300,
    /** 聊天面板最大宽度 */
    CHAT_MAX_WIDTH: 800,
} as const

// ==========================================
// 窗口默认值（原 main.ts 硬编码）
// ==========================================

export const WINDOW_DEFAULTS = {
    WIDTH: 1600,
    HEIGHT: 1000,
    MIN_WIDTH: 1200,
    MIN_HEIGHT: 700,
    BACKGROUND_COLOR: '#09090b',
} as const

// ==========================================
// 安全设置默认值（统一 main.ts 和 settingsSlice.ts）
// ==========================================

export const SECURITY_DEFAULTS = {
    /** 允许的 Shell 命令 */
    SHELL_COMMANDS: [
        // 包管理器
        'npm', 'yarn', 'pnpm', 'bun',
        // 运行时
        'node', 'npx', 'deno',
        // 版本控制
        'git',
        // 编程语言
        'python', 'python3', 'pip', 'pip3',
        'java', 'javac', 'mvn', 'gradle',
        'go', 'rust', 'cargo',
        // 构建工具
        'make', 'gcc', 'clang', 'cmake',
        // 常用命令
        'pwd', 'ls', 'dir', 'cat', 'type', 'echo', 'mkdir', 'touch', 'rm', 'mv', 'cp', 'cd',
    ],
    /** 允许的 Git 子命令 */
    GIT_SUBCOMMANDS: [
        'status', 'log', 'diff', 'add', 'commit', 'push', 'pull',
        'branch', 'checkout', 'merge', 'rebase', 'clone', 'remote',
        'fetch', 'show', 'rev-parse', 'init', 'stash', 'tag',
    ],
} as const

// ==========================================
// AI 相关默认值（原 editorConfig.ts 和 settingsSlice.ts）
// ==========================================

export const AI_DEFAULTS = {
    /** 默认提供商 */
    DEFAULT_PROVIDER: 'openai' as const,
    /** 默认模型 */
    DEFAULT_MODEL: 'gpt-4o',
    /** 最大工具调用循环数 */
    MAX_TOOL_LOOPS: 15,
    /** 补全最大 token 数 */
    COMPLETION_MAX_TOKENS: 256,
    /** 补全温度 */
    COMPLETION_TEMPERATURE: 0.1,
} as const

// ==========================================
// 性能相关默认值
// ==========================================

export const PERFORMANCE_DEFAULTS = {
    /** 文件变化防抖延迟 (ms) */
    FILE_CHANGE_DEBOUNCE_MS: 300,
    /** 代码补全防抖延迟 (ms) */
    COMPLETION_DEBOUNCE_MS: 300,
    /** 搜索防抖延迟 (ms) */
    SEARCH_DEBOUNCE_MS: 200,
    /** Git 状态刷新间隔 (ms) */
    GIT_STATUS_INTERVAL_MS: 5000,
    /** API 请求超时 (ms) */
    REQUEST_TIMEOUT_MS: 120000,
    /** 命令执行超时 (ms) */
    COMMAND_TIMEOUT_MS: 30000,
} as const
