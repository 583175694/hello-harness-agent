import { AgentSessionPort } from './AgentSessionPort';
import { PreviewAgentSessionPort } from '../preview/PreviewAgentSessionPort';
import { CoreAgentSessionPort } from '../core/CoreAgentSessionPort';

/** B0：Preview 默认；Core 联调时 `useCorePort=true`（薄 HTTP，见 docs/45 §7.3）。 */
export class AgentSessionPortModule {
  static make(resMgr: resourceManager.ResourceManager, useCorePort: boolean = false): AgentSessionPort {
    if (useCorePort) {
      return new CoreAgentSessionPort();
    }
    return new PreviewAgentSessionPort(resMgr);
  }
}
