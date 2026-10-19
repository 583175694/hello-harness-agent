import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_MCP_DIRECT_CAP,
  DEFAULT_TOOL_SEARCH_LIMIT,
} from './tool-exposure.constants';

export type McpToolExposureMode = 'full' | 'deferred_search';

@Injectable()
export class ToolExposureConfigService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  get exposureMode(): McpToolExposureMode {
    const raw = this.config.get<string>('MCP_TOOL_EXPOSURE_MODE')?.trim();
    return raw === 'deferred_search' ? 'deferred_search' : 'full';
  }

  get directCap(): number {
    return this.parseInt(this.config.get<string>('MCP_DIRECT_CAP'), DEFAULT_MCP_DIRECT_CAP);
  }

  get toolSearchEnabled(): boolean {
    return this.parseBool(this.config.get<string>('TOOL_SEARCH_ENABLED'), true);
  }

  get toolSearchDefaultLimit(): number {
    return this.parseInt(
      this.config.get<string>('TOOL_SEARCH_DEFAULT_LIMIT'),
      DEFAULT_TOOL_SEARCH_LIMIT,
    );
  }

  private parseBool(raw: string | undefined, fallback: boolean): boolean {
    if (raw === undefined) return fallback;
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
    return fallback;
  }

  private parseInt(raw: string | undefined, fallback: number): number {
    if (raw === undefined) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }
}
