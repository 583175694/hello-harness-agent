import { PreviewSessionState } from '../preview/PreviewFixtureLoader';
import { PreviewFixtureDescriptor } from '../preview/PreviewFixtures';

/** Phase A/B 共用语义；Phase A 仅 Preview 实现（对齐 Android/iOS AgentSessionPort）。 */
export interface AgentSessionPort {
  loadPreviewFixture(fileName: string): PreviewSessionState;
  listPreviewFixtures(): PreviewFixtureDescriptor[];
}
