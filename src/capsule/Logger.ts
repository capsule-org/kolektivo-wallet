
export interface Logger {
    debug: (tag: string, ...messages: any[]) => void

    info: (tag: string, ...messages: any[]) => void

    warn: (tag: string, ...messages: any[]) => void

    error: (tag: string, ...messages: any[]) => void
}

export class ConsoleLogger implements Logger {
  debug = (tag: string, ...messages: any[]) => {
    console.debug(`${tag}/${messages.join(', ')}`)
  }

  info = (tag: string, ...messages: any[]) => {
    console.info(`${tag}/${messages.join(', ')}`)
  }

  warn = (tag: string, ...messages: any[]) => {
    console.warn(`${tag}/${messages.join(', ')}`)
  }

  error = (tag: string, ...messages: any[]) => {
    console.error(`${tag}/${messages.join(', ')}`)
  }
  
}