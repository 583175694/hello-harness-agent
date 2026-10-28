import { router } from '@kit.ArkUI';
import { AppScaffold } from '../coreui/AppScaffold';
import { AppText } from '../coreui/AppText';
import { AppTopBar } from '../coreui/AppTopBar';
import { ListRow } from '../coreui/ListRow';
import { HarnessColors } from '../coreui/HarnessColors';
import { PreviewFixtureDescriptor } from '../preview/PreviewFixtures';
import { PreviewAgentSessionPort } from '../preview/PreviewAgentSessionPort';
import { PreviewLocalPreferences } from '../preview/PreviewLocalPreferences';

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
    const demoOrder: string[] = ['rich-session-showcase.json', 'stock-market-review.json'];
    this.fixtures = list.sort((a, b) => {
      const ai = demoOrder.indexOf(a.fileName);
      const bi = demoOrder.indexOf(b.fileName);
      if (ai >= 0 && bi >= 0) {
        return ai - bi;
      }
      if (ai >= 0) {
        return -1;
      }
      if (bi >= 0) {
        return 1;
      }
      return a.fileName.localeCompare(b.fileName);
    });
    this.loadErrors = errors;
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
        Column({ space: 8 }) {
          AppText({
            text: 'Gate A 十场景（mobile-contract/fixtures/preview）',
            fontSize: 12,
            muted: true,
            useDark: this.themeDark,
          })
            .margin({ top: 8, left: 12, right: 12 })
          if (this.loadErrors > 0) {
            Text(`请先运行 sync-mobile-contract.sh（${this.loadErrors} 个 fixture 未加载）`)
              .fontSize(12)
              .fontColor(HarnessColors.dangerText(this.themeDark))
              .padding({ left: 12, right: 12, top: 4, bottom: 4 })
              .width('100%')
          }
          Row() {
            ListRow({
              title: '设置',
              subtitle: '主题 · 字号 · Reduce Motion · MCP / Memory',
              useDark: this.themeDark,
              onClick: () => {
                router.pushUrl({ url: 'pages/PreviewSettingsPage' });
              },
            })
          }
          .width('100%')
          .padding({ left: 12, right: 12 })
          .id('dev-menu-settings')
          List() {
            ForEach(this.fixtures, (item: PreviewFixtureDescriptor) => {
              ListItem() {
                ListRow({
                  title: item.title,
                  subtitle: item.fileName,
                  useDark: this.themeDark,
                  onClick: () => {
                    router.replaceUrl({
                      url: 'pages/PreviewChatPage',
                      params: { fileName: item.fileName, title: item.title },
                    });
                  },
                })
              }
              .id(`dev-menu-fixture-${item.fileName}`)
            }, (item: PreviewFixtureDescriptor) => item.fileName)
          }
          .layoutWeight(1)
          .padding({ left: 12, right: 12 })
        }
        .width('100%')
        .height('100%')
        .backgroundColor(HarnessColors.canvas(this.themeDark))
      },
    })
  }
}
