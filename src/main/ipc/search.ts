/**
 * 搜索 IPC handlers
 * 使用 ripgrep 进行高性能搜索
 */

import { ipcMain } from 'electron'
import { spawn } from 'child_process'
import { rgPath } from '@vscode/ripgrep'
import type { SearchFilesOptions } from '../../shared/types'

export function registerSearchHandlers() {
  ipcMain.handle('file:search', async (
    _,
    query: string,
    rootPath: string,
    options: SearchFilesOptions
  ) => {
    if (!query || !rootPath) return []

    return new Promise((resolve) => {
      const args = [
        '--json',
        '--max-count', '2000',
        '--max-filesize', '1M',
      ]

      if (options?.isCaseSensitive) {
        args.push('--case-sensitive')
      } else {
        args.push('--smart-case')
      }

      if (options?.isWholeWord) args.push('--word-regexp')
      if (!options?.isRegex) args.push('--fixed-strings')

      // 默认忽略
      const defaultIgnores = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**']
      defaultIgnores.forEach(glob => args.push('--glob', `!${glob}`))

      if (options?.exclude) {
        options.exclude.split(',').forEach(ex => args.push('--glob', `!${ex.trim()}`))
      }
      if (options?.include) {
        options.include.split(',').forEach(inc => args.push('--glob', inc.trim()))
      }

      args.push('--', query, rootPath)

      const rg = spawn(rgPath, args)
      let output = ''

      rg.stdout.on('data', (data) => {
        output += data.toString()
      })

      rg.stderr.on('data', (data) => {
        console.error('[ripgrep]', data.toString())
      })

      rg.on('close', () => {
        const results: any[] = []
        const lines = output.split('\n')
        
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const json = JSON.parse(line)
            if (json.type === 'match') {
              results.push({
                path: json.data.path.text,
                line: json.data.line_number,
                text: json.data.lines.text.trim().slice(0, 500),
              })
            }
          } catch {}
        }
        resolve(results)
      })

      rg.on('error', (err) => {
        console.error('[ripgrep] spawn error:', err)
        resolve([])
      })
    })
  })
}
