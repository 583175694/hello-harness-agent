import { util } from '@kit.ArkTS';
import { AgentSessionPort } from '../port/AgentSessionPort';
import { PreviewFixtureLoader, PreviewSessionState } from './PreviewFixtureLoader';
import {
  PREVIEW_FIXTURE_FILES,
  PreviewFixtureDescriptor,
  fixtureTitleFromJson,
} from './PreviewFixtures';

/** Phase A：经 Port 加载 mobile-contract fixture；UI 不直接读 rawfile JSON。 */
export class PreviewAgentSessionPort implements AgentSessionPort {
  private resMgr: resourceManager.ResourceManager;

  constructor(resMgr: resourceManager.ResourceManager) {
    this.resMgr = resMgr;
  }

  loadPreviewFixture(fileName: string): PreviewSessionState {
    return PreviewFixtureLoader.load(this.resMgr, fileName);
  }

  listPreviewFixtures(): PreviewFixtureDescriptor[] {
    const list: PreviewFixtureDescriptor[] = [];
    PREVIEW_FIXTURE_FILES.forEach((fileName) => {
      try {
        const raw = this.resMgr.getRawFileContentSync(`mobile-contract/fixtures/preview/${fileName}`);
        const decoder = util.TextDecoder.create('utf-8');
        const text = decoder.decodeWithStream(raw);
        list.push(fixtureTitleFromJson(text, fileName));
      } catch {
        list.push({ fileName, scenarioId: fileName, title: fileName });
      }
    });
    return list;
  }
}
