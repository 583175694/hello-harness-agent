import { Injectable } from '@nestjs/common';
import {
  DEFAULT_MCP_DIRECT_CAP,
  DEFAULT_TOOL_SEARCH_LIMIT,
} from './tool-exposure.constants';

export type McpToolExposureMode = 'full' | 'deferred_search';

export type ToolExposurePolicy = {
  exposureMode: McpToolExposureMode;
  directCap: number;
  toolSearchEnabled: boolean;
  toolSearchDefaultLimit: number;
};

const DEFAULT_POLICY: ToolExposurePolicy = {
  exposureMode: 'deferred_search',
  directCap: DEFAULT_MCP_DIRECT_CAP,
  toolSearchEnabled: true,
  toolSearchDefaultLimit: DEFAULT_TOOL_SEARCH_LIMIT,
};

@Injectable()
export class ToolExposureConfigService {
  private policy: ToolExposurePolicy = DEFAULT_POLICY;

  static forTest(overrides: Partial<ToolExposurePolicy> = {}): ToolExposureConfigService {
    const instance = new ToolExposureConfigService();
    instance.policy = { ...DEFAULT_POLICY, ...overrides };
    return instance;
  }

  get exposureMode(): McpToolExposureMode {
    return this.policy.exposureMode;
  }

  get directCap(): number {
    return this.policy.directCap;
  }

  get toolSearchEnabled(): boolean {
    return this.policy.toolSearchEnabled;
  }

  get toolSearchDefaultLimit(): number {
    return this.policy.toolSearchDefaultLimit;
  }
}
