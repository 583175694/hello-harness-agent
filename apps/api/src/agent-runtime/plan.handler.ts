import {
  AGENT_PROTOCOL_LIMITS,
  updatePlanInputSchema,
  type PlanSnapshot,
} from '@harness/agent-protocol';

export type PlanHandlerResult =
  { ok: true; snapshot: PlanSnapshot } | { ok: false; code: string; detail: string };

export class PlanHandler {
  // 只解析和校验计划，不执行工具，也不改变 Run 生命周期。
  handle(raw: string): PlanHandlerResult {
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, code: 'INVALID_PLAN_ARGUMENTS', detail: '计划参数不是有效 JSON。' };
    }
    // Schema 校验失败只返回给模型，调用方会把它写成 Tool Result。
    const parsed = updatePlanInputSchema.safeParse(value);
    if (!parsed.success)
      return { ok: false, code: 'INVALID_PLAN_ARGUMENTS', detail: '计划结构或字段校验失败。' };
    const snapshot = parsed.data;
    // 同一时间只能有一个当前步骤，避免前端无法确定进度位置。
    if (snapshot.plan.filter((step) => step.status === 'in_progress').length > 1)
      return {
        ok: false,
        code: 'INVALID_PLAN_ARGUMENTS',
        detail: '计划同时最多只能有一个进行中的步骤。',
      };
    // 限制序列化后的体积，避免计划突破协议和上下文预算。
    if (
      Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > AGENT_PROTOCOL_LIMITS.planJsonMaxBytes
    )
      return { ok: false, code: 'INVALID_PLAN_ARGUMENTS', detail: '计划内容超过大小限制。' };
    return { ok: true, snapshot };
  }
}
