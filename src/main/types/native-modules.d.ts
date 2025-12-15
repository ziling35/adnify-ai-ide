/**
 * 原生模块类型声明
 */

// @vscode/ripgrep
declare module '@vscode/ripgrep' {
    export const rgPath: string
}

// jschardet
declare module 'jschardet' {
    interface DetectionResult {
        encoding: string | null
        confidence: number
    }
    export function detect(buffer: Buffer): DetectionResult
}

// @parcel/watcher
declare module '@parcel/watcher' {
    export interface Event {
        type: 'create' | 'update' | 'delete'
        path: string
    }
    
    export interface AsyncSubscription {
        unsubscribe(): Promise<void>
    }
    
    export interface SubscribeOptions {
        ignore?: string[]
    }
    
    export function subscribe(
        dir: string,
        fn: (err: Error | null, events: Event[]) => void,
        options?: SubscribeOptions
    ): Promise<AsyncSubscription>
}
