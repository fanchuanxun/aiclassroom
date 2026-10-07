import { describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { POST } from "./route";

function createReq(body: unknown): NextRequest {
  return {
    json: async () => body,
  } as NextRequest;
}

describe("POST /api/video-provider/test", () => {
  it("sends create-video request to /videos with model and prompt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ task_id: "task-1", status: "queued" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(createReq({
      name: "Video API",
      apiKey: "REDACTED",
      baseUrl: "https://apihub.agnes-ai.com/v1",
      model: "agnes-video-v2.0",
    }));
    const data = await res.json();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://apihub.agnes-ai.com/v1/videos",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "content-type": "application/json" }),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({
      model: "agnes-video-v2.0",
      prompt: "A short simple test video of a book gently opening on a desk.",
    });
    expect(data).toMatchObject({
      ok: true,
      provider: "openai-compatible-video",
      model: "agnes-video-v2.0",
      taskId: "task-1",
      videoId: null,
      status: "queued",
      latencyMs: expect.any(Number),
    });

    vi.unstubAllGlobals();
  });

  it("accepts 201 video_id response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ video_id: "video-1", status: "completed" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(createReq({
      apiKey: "REDACTED",
      baseUrl: "https://apihub.agnes-ai.com/v1/",
      model: "agnes-video-v2.0",
    }));
    const data = await res.json();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://apihub.agnes-ai.com/v1/videos",
      expect.any(Object),
    );
    expect(data.ok).toBe(true);
    expect(data.videoId).toBe("video-1");

    vi.unstubAllGlobals();
  });

  it("reports endpoint not found on 404 without leaking api key", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ message: "not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(createReq({
      apiKey: "REDACTED",
      baseUrl: "https://apihub.agnes-ai.com/v1",
      model: "agnes-video-v2.0",
    }));
    const data = await res.json();

    expect(data).toMatchObject({
      ok: false,
      code: "PROVIDER_ERROR",
      retryable: false,
    });
    expect(data.message).toMatch(/Video create endpoint not found/);
    expect(JSON.stringify(data)).not.toMatch(/REDACTED/);

    vi.unstubAllGlobals();
  });

  it("does not poll video status after create", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ task_id: "task-1", status: "queued" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(createReq({
      apiKey: "REDACTED",
      baseUrl: "https://apihub.agnes-ai.com/v1",
      model: "agnes-video-v2.0",
    }));

    expect(await res.json()).toMatchObject({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });
});
