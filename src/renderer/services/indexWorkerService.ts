/**
 * Index Worker Service
 * Manages the background indexing worker and provides a clean API
 * 
 * This service:
 * - Creates and manages the Web Worker
 * - Handles communication with the worker
 * - Provides progress callbacks
 * - Integrates with the main indexing service
 */

import type { IndexWorkerMessage, IndexWorkerResponse, FileToProcess, ProcessedChunk } from '../workers/indexWorker'

// ============ Types ============

export interface IndexProgress {
  processed: number
  total: number
  chunksCount: number
  isComplete: boolean
  error?: string
}

export interface IndexResult {
  chunks: ProcessedChunk[]
  totalFiles: number
  totalChunks: number
}

type ProgressCallback = (progress: IndexProgress) => void
type CompleteCallback = (result: IndexResult) => void
type ErrorCallback = (error: string) => void

// ============ Worker Service ============

class IndexWorkerService {
  private worker: Worker | null = null
  private progressCallbacks: Set<ProgressCallback> = new Set()
  private completeCallbacks: Set<CompleteCallback> = new Set()
  private errorCallbacks: Set<ErrorCallback> = new Set()
  private isInitialized = false

  /**
   * Initialize the worker
   */
  initialize(): void {
    if (this.isInitialized) return

    try {
      // Create worker from the worker file
      // Note: In Vite, we use ?worker suffix or import.meta.url
      this.worker = new Worker(
        new URL('../workers/indexWorker.ts', import.meta.url),
        { type: 'module' }
      )

      this.worker.onmessage = this.handleMessage.bind(this)
      this.worker.onerror = this.handleError.bind(this)
      
      this.isInitialized = true
      console.log('[IndexWorkerService] Worker initialized')
    } catch (error) {
      console.error('[IndexWorkerService] Failed to initialize worker:', error)
      // Fallback: worker not available, will use main thread
    }
  }

  /**
   * Check if worker is available
   */
  isAvailable(): boolean {
    return this.isInitialized && this.worker !== null
  }

  /**
   * Start indexing files
   */
  startIndexing(files: FileToProcess[]): void {
    if (!this.worker) {
      this.handleError(new ErrorEvent('error', { message: 'Worker not initialized' }))
      return
    }

    const message: IndexWorkerMessage = {
      type: 'start',
      payload: { files },
    }

    this.worker.postMessage(message)
  }

  /**
   * Stop current indexing
   */
  stopIndexing(): void {
    if (!this.worker) return

    const message: IndexWorkerMessage = {
      type: 'stop',
    }

    this.worker.postMessage(message)
  }

  /**
   * Update a single file
   */
  updateFile(file: FileToProcess): Promise<ProcessedChunk[]> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not initialized'))
        return
      }

      const handler = (event: MessageEvent<IndexWorkerResponse>) => {
        if (event.data.type === 'complete' && event.data.payload.filePath === file.path) {
          this.worker?.removeEventListener('message', handler)
          resolve(event.data.payload.chunks || [])
        } else if (event.data.type === 'error') {
          this.worker?.removeEventListener('message', handler)
          reject(new Error(event.data.payload.message))
        }
      }

      this.worker.addEventListener('message', handler)

      const message: IndexWorkerMessage = {
        type: 'update_file',
        payload: { file },
      }

      this.worker.postMessage(message)

      // Timeout after 30 seconds
      setTimeout(() => {
        this.worker?.removeEventListener('message', handler)
        reject(new Error('Timeout'))
      }, 30000)
    })
  }

  /**
   * Clear the index
   */
  clear(): void {
    if (!this.worker) return

    const message: IndexWorkerMessage = {
      type: 'clear',
    }

    this.worker.postMessage(message)
  }

  /**
   * Subscribe to progress updates
   */
  onProgress(callback: ProgressCallback): () => void {
    this.progressCallbacks.add(callback)
    return () => this.progressCallbacks.delete(callback)
  }

  /**
   * Subscribe to completion
   */
  onComplete(callback: CompleteCallback): () => void {
    this.completeCallbacks.add(callback)
    return () => this.completeCallbacks.delete(callback)
  }

  /**
   * Subscribe to errors
   */
  onError(callback: ErrorCallback): () => void {
    this.errorCallbacks.add(callback)
    return () => this.errorCallbacks.delete(callback)
  }

  /**
   * Terminate the worker
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
      this.isInitialized = false
    }
    this.progressCallbacks.clear()
    this.completeCallbacks.clear()
    this.errorCallbacks.clear()
  }

  // ============ Private Methods ============

  private handleMessage(event: MessageEvent<IndexWorkerResponse>): void {
    const { type, payload } = event.data

    switch (type) {
      case 'progress':
        this.progressCallbacks.forEach(cb => cb({
          processed: payload.processed,
          total: payload.total,
          chunksCount: payload.chunksCount,
          isComplete: false,
        }))
        break

      case 'complete':
        if (payload.chunks) {
          this.completeCallbacks.forEach(cb => cb({
            chunks: payload.chunks,
            totalFiles: payload.totalFiles || 0,
            totalChunks: payload.totalChunks || payload.chunks.length,
          }))
          this.progressCallbacks.forEach(cb => cb({
            processed: payload.totalFiles || 0,
            total: payload.totalFiles || 0,
            chunksCount: payload.totalChunks || 0,
            isComplete: true,
          }))
        }
        break

      case 'error':
        this.errorCallbacks.forEach(cb => cb(payload.message))
        this.progressCallbacks.forEach(cb => cb({
          processed: 0,
          total: 0,
          chunksCount: 0,
          isComplete: true,
          error: payload.message,
        }))
        break

      case 'status':
        console.log('[IndexWorkerService] Status:', payload)
        break
    }
  }

  private handleError(error: ErrorEvent): void {
    const message = error.message || 'Unknown worker error'
    console.error('[IndexWorkerService] Worker error:', message)
    this.errorCallbacks.forEach(cb => cb(message))
  }
}

// Export singleton
export const indexWorkerService = new IndexWorkerService()

// Export types
export type { FileToProcess, ProcessedChunk }
