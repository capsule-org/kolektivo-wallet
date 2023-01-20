
export interface Logger {
    debug: (tag: string, ...messages: any[]) => void

    info: (tag: string, ...messages: any[]) => void

    warn: (tag: string, ...messages: any[]) => void

    error: (
    tag: string,
    message: string,
    error?: Error,
    shouldSanitizeError?: boolean,
    valueToPurge?: string
    ) => void
}