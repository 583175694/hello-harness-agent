/** Vitest 循环依赖下避免 emitDecoratorMetadata 拿到 undefined 类引用。 */
export const SANDBOX_JOB_SERVICE = Symbol('SandboxJobService');
export const SANDBOX_MANAGER_SERVICE = Symbol('SandboxManagerService');
