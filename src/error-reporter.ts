const HUB_API =
  import.meta.env.VITE_HUB_ERRORS_API || "https://api.steify.com/api";
const SLUG = import.meta.env.VITE_HUB_ERRORS_SLUG || "ifbrain";

let installed = false;

type ReportPayload = {
  message: string;
  stack?: string;
  path?: string;
  metadata?: Record<string, unknown>;
};

export async function reportClientError(payload: ReportPayload): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    const base = HUB_API.replace(/\/$/, "");
    const url = `${base}/public/errors/${encodeURIComponent(SLUG)}/browser`;

    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "frontend",
        message: payload.message.slice(0, 4000),
        stack: payload.stack?.slice(0, 20000),
        path: payload.path ?? window.location.pathname,
        metadata: {
          href: window.location.href,
          ...payload.metadata,
        },
      }),
      keepalive: true,
    });
  } catch {
    // Silencioso — não gerar cascade de erros.
  }
}

export function installErrorReporting(): void {
  if (typeof window === "undefined" || installed) return;
  installed = true;

  window.addEventListener("error", (event) => {
    void reportClientError({
      message: event.message || "Erro não capturado",
      stack: event.error instanceof Error ? event.error.stack : undefined,
      metadata: {
        type: "window.error",
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "Promise rejeitada";
    void reportClientError({
      message: `Unhandled rejection: ${message}`,
      stack: reason instanceof Error ? reason.stack : undefined,
      metadata: { type: "unhandledrejection" },
    });
  });
}
