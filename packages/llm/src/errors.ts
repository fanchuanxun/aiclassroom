// @spec docs/API.md §5
// 错误分类：用户不能只看到 "Something went wrong"。

import { AppError } from "@aiclassroom/types";
import type { ErrorCode } from "@aiclassroom/types";

/** 抹掉可能泄漏的密钥形态，禁止把 Key 写进日志 / trace / 错误信息 */
export function sanitizeMessage(message: string): string {
  return message
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/(api[_-]?key["'=\s:]+)[A-Za-z0-9._-]{8,}/gi, "$1[REDACTED]");
}

function nameOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "name" in error) {
    const name = (error as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return "";
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return sanitizeMessage(error.message);
  if (typeof error === "string") return sanitizeMessage(error);
  return "未知错误";
}

function statusOf(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    const status = (error as { statusCode?: unknown }).statusCode;
    if (typeof status === "number") return status;
  }
  return undefined;
}

/** 把任意异常归类为本项目错误体系 */
export function classifyError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  const name = nameOf(error);
  const message = messageOf(error);
  const status = statusOf(error);

  // 用户主动取消
  if (name === "AbortError" || /aborted/i.test(message)) {
    return new AppError("RUNTIME_ERROR", "请求已取消", {
      retryable: true,
      cause: error,
    });
  }

  // 超时
  if (/timeout|timed out/i.test(`${name} ${message}`)) {
    return new AppError("TIMEOUT", `调用超时：${message}`, {
      retryable: true,
      cause: error,
    });
  }

  // 鉴权 / 配置问题 —— 重试无意义
  if (
    /LoadAPIKeyError|api key|unauthorized|forbidden|invalid x-api/i.test(
      `${name} ${message}`,
    ) ||
    status === 401 ||
    status === 403
  ) {
    return new AppError("PROVIDER_ERROR", `Provider 鉴权或配置异常：${message}`, {
      retryable: false,
      cause: error,
    });
  }

  // 网络
  if (
    /fetch failed|ECONNREFUSED|ENOTFOUND|ECONNRESET|network|EAI_AGAIN/i.test(
      `${name} ${message}`,
    )
  ) {
    return new AppError("NETWORK_ERROR", `网络异常：${message}`, {
      retryable: true,
      cause: error,
    });
  }

  // 模型产出不符合 schema
  if (/NoObjectGeneratedError|TypeValidationError|JSONParseError/i.test(name)) {
    return new AppError("VALIDATION_ERROR", `模型产出不符合约定结构：${message}`, {
      retryable: true,
      cause: error,
    });
  }

  // 服务端 5xx / 429 可重试
  const retryable = status === undefined ? true : status >= 500 || status === 429;
  return new AppError("LLM_ERROR", `模型调用失败：${message}`, {
    retryable,
    cause: error,
  });
}

/** 结构化错误响应体（不含任何 Secret） */
export function toErrorPayload(error: unknown): {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  traceId?: string;
} {
  const appError = classifyError(error);
  return {
    code: appError.code,
    message: appError.message,
    retryable: appError.retryable,
    ...(appError.traceId === undefined ? {} : { traceId: appError.traceId }),
  };
}
