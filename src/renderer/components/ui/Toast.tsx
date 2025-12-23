import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastProps {
    id: string
    type: ToastType
    title: string
    message?: string
    duration?: number
    onDismiss: (id: string) => void
    action?: {
        label: string
        onClick: () => void
    }
}

const TOAST_ICONS = {
    success: CheckCircle,
    error: XCircle,
    warning: AlertTriangle,
    info: Info,
}

const TOAST_STYLES = {
    success: {
        container: "shadow-[0_0_30px_-10px_rgba(34,197,94,0.3)] border-green-500/20",
        icon: "text-green-400",
        glow: "bg-green-500/20"
    },
    error: {
        container: "shadow-[0_0_30px_-10px_rgba(239,68,68,0.3)] border-red-500/20",
        icon: "text-red-400",
        glow: "bg-red-500/20"
    },
    warning: {
        container: "shadow-[0_0_30px_-10px_rgba(234,179,8,0.3)] border-yellow-500/20",
        icon: "text-yellow-400",
        glow: "bg-yellow-500/20"
    },
    info: {
        container: "shadow-[0_0_30px_-10px_rgba(59,130,246,0.3)] border-blue-500/20",
        icon: "text-blue-400",
        glow: "bg-blue-500/20"
    },
}

export function Toast({ id, type, title, message, duration = 3000, onDismiss, action }: ToastProps) {
    const [isExiting, setIsExiting] = useState(false)
    const Icon = TOAST_ICONS[type]
    const style = TOAST_STYLES[type]

    useEffect(() => {
        if (duration === 0) return
        const timer = setTimeout(() => {
            setIsExiting(true)
            setTimeout(() => onDismiss(id), 300)
        }, duration)
        return () => clearTimeout(timer)
    }, [duration, id, onDismiss])

    const handleDismiss = () => {
        setIsExiting(true)
        setTimeout(() => onDismiss(id), 300)
    }

    return (
        <div className={`
            relative flex items-start gap-4 p-4 rounded-xl border backdrop-blur-xl transition-all duration-300 ease-out
            bg-black/60
            ${style.container}
            ${isExiting ? 'opacity-0 translate-x-8 scale-95' : 'opacity-100 translate-x-0 scale-100'}
            animate-slide-in-right group
            min-w-[320px] max-w-[400px]
        `}>
            {/* Ambient Glow */}
            <div className={`absolute inset-0 rounded-xl opacity-10 ${style.glow} blur-xl -z-10`} />

            <div className={`p-2 rounded-full bg-white/5 border border-white/5 ${style.icon}`}>
                <Icon className="w-5 h-5" />
            </div>

            <div className="flex-1 min-w-0 pt-0.5">
                <h4 className="text-sm font-medium text-text-primary leading-none mb-1.5">{title}</h4>
                {message && <p className="text-xs text-text-secondary leading-relaxed break-words">{message}</p>}
                {action && (
                    <button
                        onClick={action.onClick}
                        className="text-xs font-medium text-accent hover:text-accent-hover underline underline-offset-2 mt-2 transition-colors"
                    >
                        {action.label}
                    </button>
                )}
            </div>

            <button
                onClick={handleDismiss}
                className="p-1.5 -mr-1 -mt-1 text-text-muted hover:text-text-primary hover:bg-white/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    )
}
