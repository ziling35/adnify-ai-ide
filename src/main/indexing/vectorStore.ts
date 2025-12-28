/**
 * 向量存储服务
 * 使用 LanceDB 存储和检索代码向量
 */

import { logger } from '@shared/utils/Logger'
import * as path from 'path'
import * as fs from 'fs'
import { IndexedChunk, SearchResult } from './types'

// LanceDB 类型
type LanceDBConnection = any
type LanceDBTable = any
type LanceDBSearchResult = any

export class VectorStoreService {
  private db: LanceDBConnection | null = null
  private table: LanceDBTable | null = null
  private indexPath: string
  private tableName = 'code_chunks'

  constructor(workspacePath: string) {
    this.indexPath = path.join(workspacePath, '.adnify', 'index')
  }

  /**
   * 初始化数据库连接
   */
  async initialize(): Promise<void> {
    // 确保目录存在
    if (!fs.existsSync(this.indexPath)) {
      fs.mkdirSync(this.indexPath, { recursive: true })
    }

    try {
      const lancedb = await import('@lancedb/lancedb')
      this.db = await lancedb.connect(this.indexPath)

      // 检查是否已有表
      const tables = await this.db.tableNames()
      if (tables.includes(this.tableName)) {
        this.table = await this.db.openTable(this.tableName)
      }
      logger.index.info('[VectorStore] Initialized at:', this.indexPath)
    } catch (e) {
      logger.index.error('[VectorStore] Failed to initialize LanceDB:', e)
      this.db = null
    }
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.db !== null
  }

  /**
   * 检查是否有索引数据
   */
  async hasIndex(): Promise<boolean> {
    if (!this.table) return false
    const count = await this.table.countRows()
    return count > 0
  }

  /**
   * 获取索引统计
   */
  async getStats(): Promise<{ chunkCount: number; fileCount: number }> {
    if (!this.table) {
      return { chunkCount: 0, fileCount: 0 }
    }

    const count = await this.table.countRows()
    return { chunkCount: count, fileCount: Math.ceil(count / 5) }
  }

  /**
   * 获取所有文件的 Hash
   * 只查询 filePath 和 fileHash 字段，减少内存占用
   */
  async getFileHashes(): Promise<Map<string, string>> {
    if (!this.table) return new Map()
    
    try {
      const hashMap = new Map<string, string>()
      
      // LanceDB 不支持 offset，直接查询所有记录
      // 只选择需要的字段以减少内存占用
      const results = await this.table
        .query()
        .select(['filePath', 'fileHash'])
        .execute()

      for (const r of results) {
        if (r.filePath && r.fileHash) {
          // 只保留第一次出现的 hash（同一文件的多个 chunk 有相同 hash）
          if (!hashMap.has(r.filePath as string)) {
            hashMap.set(r.filePath as string, r.fileHash as string)
          }
        }
      }

      logger.index.info(`[VectorStore] Loaded ${hashMap.size} file hashes`)
      return hashMap
    } catch (e) {
      logger.index.error('[VectorStore] Error fetching file hashes:', e)
      return new Map()
    }
  }

  /**
   * 创建或重建索引
   */
  async createIndex(chunks: IndexedChunk[]): Promise<void> {
    if (!this.db) return

    if (chunks.length === 0) {
      logger.index.info('[VectorStore] No chunks to index')
      return
    }

    // 准备数据
    const data = chunks.map(chunk => ({
      id: chunk.id,
      filePath: chunk.filePath,
      relativePath: chunk.relativePath,
      fileHash: chunk.fileHash,
      content: chunk.content,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      type: chunk.type,
      language: chunk.language,
      symbols: chunk.symbols?.join(',') || '',
      vector: chunk.vector,
    }))

    const tables = await this.db.tableNames()
    if (tables.includes(this.tableName)) {
      await this.db.dropTable(this.tableName)
    }

    this.table = await this.db.createTable(this.tableName, data)
    logger.index.info(`[VectorStore] Created index with ${chunks.length} chunks`)
  }

  /**
   * 批量添加 chunks (追加模式，表不存在时自动创建)
   */
  async addBatch(chunks: IndexedChunk[]): Promise<void> {
    if (!this.db || chunks.length === 0) return

    const data = chunks.map(chunk => ({
      id: chunk.id,
      filePath: chunk.filePath,
      relativePath: chunk.relativePath,
      fileHash: chunk.fileHash,
      content: chunk.content,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      type: chunk.type,
      language: chunk.language,
      symbols: chunk.symbols?.join(',') || '',
      vector: chunk.vector,
    }))

    // 如果表不存在，创建表
    if (!this.table) {
      this.table = await this.db.createTable(this.tableName, data)
      logger.index.info(`[VectorStore] Created table with ${chunks.length} initial chunks`)
    } else {
      await this.table.add(data)
    }
  }

  /**
   * 添加或更新文件的 chunks
   */
  async upsertFile(filePath: string, chunks: IndexedChunk[]): Promise<void> {
    if (!this.table || !this.db) return

    try {
      await this.table.delete(`filePath = '${filePath.replace(/'/g, "''")}'`)
    } catch {
      // ignore
    }

    if (chunks.length === 0) return

    const data = chunks.map(chunk => ({
      id: chunk.id,
      filePath: chunk.filePath,
      relativePath: chunk.relativePath,
      fileHash: chunk.fileHash,
      content: chunk.content,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      type: chunk.type,
      language: chunk.language,
      symbols: chunk.symbols?.join(',') || '',
      vector: chunk.vector,
    }))

    await this.table.add(data)
  }

  /**
   * 删除文件的 chunks
   */
  async deleteFile(filePath: string): Promise<void> {
    if (!this.table) return

    try {
      await this.table.delete(`filePath = '${filePath.replace(/'/g, "''")}'`)
    } catch {
      // ignore
    }
  }

  /**
   * 向量搜索
   */
  async search(queryVector: number[], topK: number = 10): Promise<SearchResult[]> {
    if (!this.table) return []

    const results = await this.table
      .search(queryVector)
      .limit(topK)
      .execute()

    return results.map((r: LanceDBSearchResult) => ({
      filePath: r.filePath,
      relativePath: r.relativePath,
      content: r.content,
      startLine: r.startLine,
      endLine: r.endLine,
      type: r.type,
      language: r.language,
      score: 1 - r._distance,
    }))
  }

  /**
   * 清空索引
   */
  async clear(): Promise<void> {
    if (!this.db) return

    const tables = await this.db.tableNames()
    if (tables.includes(this.tableName)) {
      await this.db.dropTable(this.tableName)
      this.table = null
    }
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    this.db = null
    this.table = null
  }
}
