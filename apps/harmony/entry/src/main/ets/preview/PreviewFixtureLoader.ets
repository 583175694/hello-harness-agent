import { util } from '@kit.ArkTS';
import {
  ChatLine,
  ComposerPreviewState,
  WorkbenchPreviewState,
  SessionDrawerPreviewState,
  SessionDrawerRow,
  emptyWorkbench,
  parseComposer,
  parseConversation,
  parseWorkbench,
} from './PreviewModels';
import { PreviewTransitionBundle, parsePreviewTransitions } from './PreviewTransitions';

export interface PreviewChromeState {
  connectionState: string;
  serviceState: string;
  runSummary: string;
  peekBarTitle: string;
  peekBarSubtitle: string;
}

export interface PreviewReplayConfig {
  tickMs: number;
  codepointsPerTick: number;
  tailTarget: string;
}

export interface PreviewUiHints {
  initialDrawerOpen: boolean;
}

export interface PreviewSessionState {
  fileName: string;
  title: string;
  isLanding: boolean;
  lines: ChatLine[];
  chrome: PreviewChromeState;
  problemTitle: string;
  problemDetail: string;
  composer: ComposerPreviewState;
  workbench: WorkbenchPreviewState;
  replay: PreviewReplayConfig | null;
  sessionDrawer: SessionDrawerPreviewState;
  uiHints: PreviewUiHints;
  previewTransitions?: PreviewTransitionBundle;
}

export class PreviewFixtureLoader {
  static load(resMgr: resourceManager.ResourceManager, fileName: string): PreviewSessionState {
    const fallback: PreviewSessionState = {
      fileName,
      title: fileName,
      isLanding: true,
      lines: [],
      chrome: {
        connectionState: 'idle',
        serviceState: 'ready',
        runSummary: '',
        peekBarTitle: '',
        peekBarSubtitle: '',
      },
      problemTitle: '',
      problemDetail: '',
      composer: parseComposer(undefined),
      workbench: emptyWorkbench(),
      replay: null,
      sessionDrawer: { draftTitle: '新对话', searchPlaceholder: '搜索会话', sessions: [] },
      uiHints: { initialDrawerOpen: false },
    };
    try {
      const raw = resMgr.getRawFileContentSync(`mobile-contract/fixtures/preview/${fileName}`);
      const decoder = util.TextDecoder.create('utf-8');
      const text = decoder.decodeWithStream(raw);
      const data = JSON.parse(text) as Record<string, Object>;
      const conversation = data['conversation'] as Array<Record<string, Object>>;
      const composer = data['composer'] as Record<string, Object>;
      const chromeRaw = data['chrome'] as Record<string, string> | undefined;
      const problem = data['problemDetails'] as Record<string, string> | undefined;
      const wb = data['workbench'] as Record<string, Object> | undefined;

      const chrome: PreviewChromeState = {
        connectionState: `${chromeRaw?.['connectionState'] ?? 'idle'}`,
        serviceState: `${chromeRaw?.['serviceState'] ?? 'ready'}`,
        runSummary: `${chromeRaw?.['runSummary'] ?? ''}`,
        peekBarTitle: `${chromeRaw?.['peekBarTitle'] ?? ''}`,
        peekBarSubtitle: `${chromeRaw?.['peekBarSubtitle'] ?? ''}`,
      };

      let problemTitle = '';
      let problemDetail = '';
      if (problem) {
        problemTitle = `${problem['title'] ?? ''}`;
        problemDetail = `${problem['detail'] ?? ''}`;
      }

      const lines = parseConversation(conversation);
      const isLanding = !conversation || conversation.length === 0;
      const replay = PreviewFixtureLoader.parseReplay(data, conversation);
      const drawerRaw = data['sessionDrawer'] as Record<string, Object> | undefined;
      const sessionDrawer = PreviewFixtureLoader.parseSessionDrawer(drawerRaw);
      const uiHintsRaw = data['uiHints'] as Record<string, Object> | undefined;
      const uiHints: PreviewUiHints = {
        initialDrawerOpen: uiHintsRaw?.['initialDrawerOpen'] === true,
      };

      return {
        fileName,
        title: `${data['title'] ?? fileName}`,
        isLanding,
        lines,
        chrome,
        problemTitle,
        problemDetail,
        composer: parseComposer(composer),
        workbench: parseWorkbench(wb),
        replay,
        sessionDrawer,
        uiHints,
        previewTransitions: parsePreviewTransitions(data['previewTransitions'] as Record<string, Object> | undefined),
      };
    } catch {
      return fallback;
    }
  }

  private static parseSessionDrawer(raw: Record<string, Object> | undefined): SessionDrawerPreviewState {
    if (!raw) {
      return { draftTitle: '新对话', searchPlaceholder: '搜索会话', sessions: [] };
    }
    const rows = raw['sessions'] as Array<Record<string, Object>> | undefined;
    const sessions: SessionDrawerRow[] = [];
    if (rows) {
      rows.forEach((row) => {
        sessions.push({
          id: `${row['id'] ?? ''}`,
          title: `${row['title'] ?? ''}`,
          time: `${row['time'] ?? ''}`,
          active: row['active'] === true,
          pinned: row['pinned'] === true,
          running: row['running'] === true,
        });
      });
    }
    return {
      draftTitle: `${raw['draftTitle'] ?? '新对话'}`,
      searchPlaceholder: `${raw['searchPlaceholder'] ?? '搜索会话'}`,
      sessions,
    };
  }

  private static parseReplay(
    data: Record<string, Object>,
    conversation: Array<Record<string, Object>> | undefined,
  ): PreviewReplayConfig | null {
    const replayRaw = data['replay'] as Record<string, Object> | undefined;
    const tailRaw = replayRaw?.['assistantTail'] as Record<string, Object> | undefined;
    if (!tailRaw) {
      return null;
    }
    let tailTarget = '';
    if (conversation) {
      for (let i = conversation.length - 1; i >= 0; i--) {
        const row = conversation[i];
        if (`${row['kind'] ?? ''}` === 'assistant') {
          const pending = row['pendingText'] as string;
          if (pending && pending.length > 0) {
            tailTarget = pending;
          }
          break;
        }
      }
    }
    if (tailTarget.length === 0) {
      return null;
    }
    return {
      tickMs: Number(tailRaw['tickMs'] ?? 100),
      codepointsPerTick: Number(tailRaw['codepointsPerTick'] ?? 6),
      tailTarget,
    };
  }
}
