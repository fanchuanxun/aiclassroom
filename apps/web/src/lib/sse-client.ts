// @spec docs/PLAN.md (Phase 1B)
// 客户端 SSE 解析：POST 一个 JSON body，逐事件回调。
// 不依赖任何第三方 SSE 库，直接消费 fetch ReadableStream。

export type SseEventHandler = (event: Record<string, unknown>) => void;

export async function postSSE(
  url: string,
  body: unknown,
  handlers: { onEvent: SseEventHandler; signal?: AbortSignal },
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    ...(handlers.signal ? { signal: handlers.signal } : {}),
  });

  if (!res.ok || res.body === null) {
    // 尝试从错误响应体读出结构化信息
    let message = `HTTP ${res.status}`;
    try {
      const text = await res.text();
      if (text) message = text;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const line = raw
        .split("\n")
        .find((l) => l.startsWith("data:"));
      if (!line) continue;
      const payload = line.slice("data:".length).trim();
      if (!payload || payload === "[DONE]") continue;
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(payload) as Record<string, unknown>;
      } catch {
        // 单条解析失败不影响后续事件
        continue;
      }
      handlers.onEvent(event);
    }
  }
}
