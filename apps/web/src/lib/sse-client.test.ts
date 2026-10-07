import { describe, expect, it, vi } from "vitest";
import { postSSE } from "./sse-client";

function sseResponse(...events: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(events.join("")));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

describe("postSSE", () => {
  it("传播 onEvent 抛出的业务错误，而不是被 JSON 解析 catch 吞掉", async () => {
    const error = new Error("PROVIDER_RATE_LIMITED");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      sseResponse('data: {"type":"error","code":"LLM_ERROR"}\n\n'),
    ));

    await expect(
      postSSE("/api/generate/outline", {}, {
        onEvent: () => {
          throw error;
        },
      }),
    ).rejects.toBe(error);

    vi.unstubAllGlobals();
  });

  it("正常处理 outline_ready 事件", async () => {
    const received: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      sseResponse(
        'data: {"type":"outline_ready","outline":{"title":"t"}}\n\n',
        'data: {"type":"done"}\n\n',
      ),
    ));

    await postSSE("/api/generate/outline", {}, {
      onEvent: (event) => received.push(event),
    });

    expect(received).toHaveLength(2);
    expect(received[0]?.type).toBe("outline_ready");
    vi.unstubAllGlobals();
  });

  it("保留真实 AbortError 的传播行为", async () => {
    const abort = new DOMException("The operation was aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort));

    await expect(
      postSSE("/api/generate/outline", {}, { onEvent: () => undefined }),
    ).rejects.toBe(abort);

    vi.unstubAllGlobals();
  });
});
