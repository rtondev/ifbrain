/**
 * APIs usadas pelo pdf.js / Mermaid que faltam em Safari mais antigo.
 * Tem de ser importado antes dessas bibliotecas.
 */
type PromiseWithResolversFn = <T = unknown>() => {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
}

const PromiseCtor = Promise as typeof Promise & {
  withResolvers?: PromiseWithResolversFn
}

if (typeof PromiseCtor.withResolvers !== 'function') {
  PromiseCtor.withResolvers = function withResolvers<T = unknown>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }
}

if (typeof Object.hasOwn !== 'function') {
  Object.defineProperty(Object, 'hasOwn', {
    configurable: true,
    writable: true,
    value: (obj: object, prop: PropertyKey) =>
      Object.prototype.hasOwnProperty.call(obj, prop),
  })
}

if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = <T>(value: T): T =>
    JSON.parse(JSON.stringify(value)) as T
}

const URLCtor = URL as typeof URL & {
  parse?: (url: string, base?: string | URL) => URL | null
  canParse?: (url: string, base?: string | URL) => boolean
}

if (typeof URLCtor.parse !== 'function') {
  URLCtor.parse = (url: string, base?: string | URL): URL | null => {
    try {
      return base !== undefined ? new URL(url, base) : new URL(url)
    } catch {
      return null
    }
  }
}

if (typeof URLCtor.canParse !== 'function') {
  URLCtor.canParse = (url: string, base?: string | URL): boolean => {
    try {
      if (base !== undefined) new URL(url, base)
      else new URL(url)
      return true
    } catch {
      return false
    }
  }
}

const AbortSignalCtor = AbortSignal as typeof AbortSignal & {
  any?: (signals: AbortSignal[]) => AbortSignal
  timeout?: (ms: number) => AbortSignal
}

if (typeof AbortSignalCtor.any !== 'function') {
  AbortSignalCtor.any = (signals: AbortSignal[]): AbortSignal => {
    const controller = new AbortController()
    const onAbort = () => {
      controller.abort()
      for (const s of signals) s.removeEventListener('abort', onAbort)
    }
    for (const s of signals) {
      if (s.aborted) {
        onAbort()
        break
      }
      s.addEventListener('abort', onAbort, { once: true })
    }
    return controller.signal
  }
}

if (typeof AbortSignalCtor.timeout !== 'function') {
  AbortSignalCtor.timeout = (ms: number): AbortSignal => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), ms)
    return controller.signal
  }
}
