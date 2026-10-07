// 领域层错误类型。错误码体系见 docs/API.md §5。

export type ErrorCode =
  | "LLM_ERROR"
  | "NETWORK_ERROR"
  | "PROVIDER_ERROR"
  | "TIMEOUT"
  | "VALIDATION_ERROR"
  | "GENERATION_ERROR"
  | "RUNTIME_ERROR"
  | "PERSISTENCE_ERROR";

export type ValidationIssue = {
  /** 数据路径，如 `scenes[2].actions[0].roleId` */
  path: string;
  code: string;
  message: string;
};

/** 数据违反 schema 或运行时不变量时抛出。禁止自动修复，必须向上冒泡。 */
export class ValidationError extends Error {
  readonly code = "VALIDATION_ERROR" as const;
  readonly issues: readonly ValidationIssue[];
  readonly retryable = true;

  constructor(issues: readonly ValidationIssue[]) {
    super(`数据校验失败：${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);
    this.name = "ValidationError";
    this.issues = issues;
  }
}

/** 通用应用错误。UI 据此展示「发生了什么 / 能否重试 / 如何恢复」。 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly traceId?: string | undefined;
  override readonly cause?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    options: { retryable?: boolean; traceId?: string; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.traceId = options.traceId;
    this.cause = options.cause;
  }
}
