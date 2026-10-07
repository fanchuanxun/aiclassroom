// @spec docs/PLAN.md (Phase 1B)
// 服务端 SSE 通道：把对象逐条序列化为 `data: ...\n\n`。

export interface SseChannel {
  stream: ReadableStream<Uint8Array>;
  send: (data: unknown) => void;
  close: () => void;
}

export const SSE_HEADERS: Record<string, string> = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
};

export function createSseChannel(): SseChannel {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    stream,
    send: (data: unknown) => {
      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      } catch {
        /* 通道已关闭，忽略 */
      }
    },
    close: () => {
      try {
        controller.close();
      } catch {
        /* 已关闭 */
      }
    },
  };
}

/**
 * 把 SSE 通道包装为 Response。
 * 由于 TS lib 中 stream/web 与 DOM 的 ReadableStream 泛型参数不完全一致，
 * 此处进行一次 `unknown` 桥接，避免 `BodyInit` 类型歧义。运行期二者完全兼容。
 */
export function toSseResponse(channel: SseChannel): Response {
  return new Response(channel.stream as unknown as BodyInit, {
    headers: SSE_HEADERS,
  });
}
