import { router } from '@kit.ArkUI';
import { AppScaffold } from '../coreui/AppScaffold';
import { AppTopBar } from '../coreui/AppTopBar';
import { HarnessColors } from '../coreui/HarnessColors';
import { SettingsNavRow } from '../coreui/SettingsNavRow';
import { SettingsSection } from '../coreui/SettingsSection';
import { PreviewFixtureDescriptor } from '../preview/PreviewFixtures';
import { PreviewAgentSessionPort } from '../preview/PreviewAgentSessionPort';
import { PreviewLocalPreferences } from '../preview/PreviewLocalPreferences';
import { harnessPageTransition } from '../coreui/HarnessPageTransition';

const DEMO_FIXTURE_ORDER: string[] = [
  'chat-markdown-gallery.json',
  'rich-session-showcase.json',
  'stock-market-review.json',
];

function demoFixtureSortRank(fileName: string): number {
  const index = DEMO_FIXTURE_ORDER.indexOf(fileName);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

@Entry
@Component
struct PreviewMenuPage {
  @State fixtures: PreviewFixtureDescriptor[] = [];
  @State loadErrors: number = 0;
  @State themeDark: boolean = PreviewLocalPreferences.themeDark;

  aboutToAppear(): void {
    this.reloadFixtures();
  }

  onPageShow(): void {
    this.themeDark = PreviewLocalPreferences.themeDark;
  }

  reloadFixtures(): void {
    const resMgr = getContext(this).resourceManager;
    const port = new PreviewAgentSessionPort(resMgr);
    const list = port.listPreviewFixtures();
    let errors = 0;
    list.forEach((item) => {
      if (item.title === item.fileName) {
        errors++;
      }
    });
    this.fixtures = list.sort((a, b) => {
      const ra = demoFixtureSortRank(a.fileName);
      const rb = demoFixtureSortRank(b.fileName);
      if (ra !== rb) {
        return ra - rb;
      }
      return a.fileName.localeCompare(b.fileName);
    });
    this.loadErrors = errors;
  }

  pageTransition() {
    harnessPageTransition()
  }

  build() {
    AppScaffold({
      topBar: () => {
        AppTopBar({
          title: '演示场景',
          useDark: this.themeDark,
          leadingGlyph: '‹',
          onLeadingClick: () => router.back(),
        })
      },
      content: () => {
        Scroll() {
          Column({ space: 20 }) {
            if (this.loadErrors > 0) {
              Text(`部分场景未加载（${this.loadErrors}），请先运行 sync-mobile-contract.sh`)
                .fontSize(12)
                .fontColor(HarnessColors.dangerText(this.themeDark))
                .width('100%')
                .padding({ left: 4, right: 4 })
            }

            SettingsSection({ sectionLabel: '快捷', useDark: this.themeDark }) {
              SettingsNavRow({
                title: '设置',
                useDark: this.themeDark,
                showDivider: false,
                onClick: () => {
                  router.pushUrl({ url: 'pages/PreviewSettingsPage' });
                },
              })
            }
            .id('dev-menu-settings')

            SettingsSection({ sectionLabel: '场景', useDark: this.themeDark }) {
              ForEach(this.fixtures, (item: PreviewFixtureDescriptor, index: number) => {
                SettingsNavRow({
                  title: item.title,
                  useDark: this.themeDark,
                  showDivider: index < this.fixtures.length - 1,
                  onClick: () => {
                    router.replaceUrl({
                      url: 'pages/PreviewChatPage',
                      params: { fileName: item.fileName, title: item.title },
                    });
                  },
                })
                  .id(`dev-menu-fixture-${item.fileName}`)
              }, (item: PreviewFixtureDescriptor) => item.fileName)
            }
          }
          .width('100%')
          .padding({ left: 16, right: 16, top: 8, bottom: 16 })
        }
        .width('100%')
        .height('100%')
        .scrollBar(BarState.Off)
        .backgroundColor(HarnessColors.canvas(this.themeDark))
      },
    })
  }
}
