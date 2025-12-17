/**
 * Index Worker
 * Background worker for codebase indexing to avoid blocking the main UI thread
 * 
 * This worker handles:
 * - File content processing
 * - Text chunking
 * - Embedding generation coordination
 * - Progress reporting
 */

// Worker message types
export interface IndexWorkerMessage {
  type: 'start' | 'stop' | 'update_file' | 'search' | 'clear'
  payload?: any
}

export interface IndexWorkerResponse {
  type: 'progress' | 'complete' | 'error' | 'search_result' | 'status'
  payload: any
}

// File processing types
interface FileToProcess {
  path: string
  content: string
  relativePath: string
}

interface ProcessedChunk {
  content: string
  filePath: string
  relativePath: string
  startLine: number
  endLine: number
  type: 'function' | 'class' | 'block' | 'file'
  language: string
  symbols: string[]
}

// Configuration
const CONFIG = {
  chunkSize: 1500,
  chunkOverlap: 200,
  maxFileSize: 500000, // 500KB
  batchSize: 10,
  ignoreDirs: ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv', 'coverage'],
  supportedExtensions: [
    'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
    'py', 'pyw',
    'java', 'kt', 'kts',
    'go',
    'rs',
    'c', 'cpp', 'cc', 'cxx', 'h', 'hpp',
    'cs',
    'rb',
    'php',
    'swift',
    'scala',
    'vue', 'svelte',
    'html', 'css', 'scss', 'less',
    'json', 'yaml', 'yml', 'toml',
    'md', 'mdx',
    'sql',
    'sh', 'bash', 'zsh',
    'dockerfile',
  ],
}

// Language detection
const LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  py: 'python', pyw: 'python',
  java: 'java', kt: 'kotlin', kts: 'kotlin',
  go: 'go', rs: 'rust',
  c: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', h: 'c', hpp: 'cpp',
  cs: 'csharp', rb: 'ruby', php: 'php',
  swift: 'swift', scala: 'scala',
  vue: 'vue', svelte: 'svelte',
  html: 'html', css: 'css', scss: 'scss', less: 'less',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
  md: 'markdown', mdx: 'markdown',
  sql: 'sql', sh: 'shell', bash: 'shell', zsh: 'shell',
  dockerfile: 'dockerfile',
}

function getLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  return LANGUAGE_MAP[ext] || 'plaintext'
}

function shouldIndexFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  return CONFIG.supportedExtensions.includes(ext)
}

// Symbol extraction patterns
const SYMBOL_PATTERNS: Record<string, RegExp[]> = {
  typescript: [
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
    /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/g,
    /(?:export\s+)?class\s+(\w+)/g,
    /(?:export\s+)?interface\s+(\w+)/g,
    /(?:export\s+)?type\s+(\w+)/g,
    /(?:export\s+)?enum\s+(\w+)/g,
  ],
  python: [
    /def\s+(\w+)\s*\(/g,
    /class\s+(\w+)/g,
    /(\w+)\s*=\s*(?:lambda|async\s+def)/g,
  ],
  java: [
    /(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?(?:class|interface|enum)\s+(\w+)/g,
    /(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?(?:\w+\s+)+(\w+)\s*\(/g,
  ],
  go: [
    /func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)/g,
    /type\s+(\w+)\s+(?:struct|interface)/g,
  ],
  rust: [
    /fn\s+(\w+)/g,
    /struct\s+(\w+)/g,
    /enum\s+(\w+)/g,
    /trait\s+(\w+)/g,
    /impl\s+(?:\w+\s+for\s+)?(\w+)/g,
  ],
}

function extractSymbols(content: string, language: string): string[] {
  const symbols: Set<string> = new Set()
  const patterns = SYMBOL_PATTERNS[language] || SYMBOL_PATTERNS.typescript
  
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags)
    let match
    while ((match = regex.exec(content)) !== null) {
      if (match[1]) {
        symbols.add(match[1])
      }
    }
  }
  
  return Array.from(symbols)
}

// Chunking logic
function chunkContent(file: FileToProcess): ProcessedChunk[] {
  const chunks: ProcessedChunk[] = []
  const language = getLanguage(file.path)
  const lines = file.content.split('\n')
  
  // For small files, create a single chunk
  if (file.content.length <= CONFIG.chunkSize) {
    chunks.push({
      content: file.content,
      filePath: file.path,
      relativePath: file.relativePath,
      startLine: 1,
      endLine: lines.length,
      type: 'file',
      language,
      symbols: extractSymbols(file.content, language),
    })
    return chunks
  }
  
  // For larger files, chunk by lines with overlap
  let currentChunk = ''
  let chunkStartLine = 1
  let currentLine = 0
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    currentLine = i + 1
    
    if (currentChunk.length + line.length + 1 > CONFIG.chunkSize) {
      // Save current chunk
      if (currentChunk.trim()) {
        chunks.push({
          content: currentChunk,
          filePath: file.path,
          relativePath: file.relativePath,
          startLine: chunkStartLine,
          endLine: currentLine - 1,
          type: 'block',
          language,
          symbols: extractSymbols(currentChunk, language),
        })
      }
      
      // Start new chunk with overlap
      const overlapLines = Math.ceil(CONFIG.chunkOverlap / 80) // Assume ~80 chars per line
      const overlapStart = Math.max(0, i - overlapLines)
      currentChunk = lines.slice(overlapStart, i).join('\n') + '\n'
      chunkStartLine = overlapStart + 1
    }
    
    currentChunk += line + '\n'
  }
  
  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk,
      filePath: file.path,
      relativePath: file.relativePath,
      startLine: chunkStartLine,
      endLine: lines.length,
      type: 'block',
      language,
      symbols: extractSymbols(currentChunk, language),
    })
  }
  
  return chunks
}

// Worker state
let isProcessing = false
let shouldStop = false

// Process files in batches
async function processFiles(
  files: FileToProcess[],
  onProgress: (processed: number, total: number, chunks: ProcessedChunk[]) => void
): Promise<ProcessedChunk[]> {
  const allChunks: ProcessedChunk[] = []
  let processed = 0
  
  for (let i = 0; i < files.length; i += CONFIG.batchSize) {
    if (shouldStop) break
    
    const batch = files.slice(i, i + CONFIG.batchSize)
    
    for (const file of batch) {
      if (shouldStop) break
      
      // Skip files that are too large
      if (file.content.length > CONFIG.maxFileSize) {
        console.log(`[IndexWorker] Skipping large file: ${file.path}`)
        continue
      }
      
      const chunks = chunkContent(file)
      allChunks.push(...chunks)
      processed++
    }
    
    // Report progress
    onProgress(processed, files.length, allChunks)
    
    // Yield to allow other operations
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  
  return allChunks
}

// Message handler
self.onmessage = async (event: MessageEvent<IndexWorkerMessage>) => {
  const { type, payload } = event.data
  
  switch (type) {
    case 'start': {
      if (isProcessing) {
        self.postMessage({
          type: 'error',
          payload: { message: 'Already processing' },
        } as IndexWorkerResponse)
        return
      }
      
      isProcessing = true
      shouldStop = false
      
      try {
        const files: FileToProcess[] = payload.files || []
        
        const chunks = await processFiles(files, (processed, total, currentChunks) => {
          self.postMessage({
            type: 'progress',
            payload: {
              processed,
              total,
              chunksCount: currentChunks.length,
            },
          } as IndexWorkerResponse)
        })
        
        self.postMessage({
          type: 'complete',
          payload: {
            chunks,
            totalFiles: files.length,
            totalChunks: chunks.length,
          },
        } as IndexWorkerResponse)
      } catch (error) {
        self.postMessage({
          type: 'error',
          payload: { message: error instanceof Error ? error.message : String(error) },
        } as IndexWorkerResponse)
      } finally {
        isProcessing = false
      }
      break
    }
    
    case 'stop': {
      shouldStop = true
      self.postMessage({
        type: 'status',
        payload: { stopped: true },
      } as IndexWorkerResponse)
      break
    }
    
    case 'update_file': {
      const file: FileToProcess = payload.file
      if (!shouldIndexFile(file.path)) {
        self.postMessage({
          type: 'complete',
          payload: { chunks: [], skipped: true },
        } as IndexWorkerResponse)
        return
      }
      
      const chunks = chunkContent(file)
      self.postMessage({
        type: 'complete',
        payload: { chunks, filePath: file.path },
      } as IndexWorkerResponse)
      break
    }
    
    case 'clear': {
      shouldStop = true
      isProcessing = false
      self.postMessage({
        type: 'status',
        payload: { cleared: true },
      } as IndexWorkerResponse)
      break
    }
  }
}

// Export types for use in main thread
export type { FileToProcess, ProcessedChunk }
