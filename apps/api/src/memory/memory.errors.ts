/** Settings / 服务端门控拒绝写入（非 404）。 */
export class MemoryEligibilityRejectedError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = 'MemoryEligibilityRejectedError';
    this.reason = reason;
  }
}
