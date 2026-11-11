export interface PreviewFixtureDescriptor {
  fileName: string;
  scenarioId: string;
  title: string;
}

export const PREVIEW_FIXTURE_FILES: string[] = [
  'empty-landing.json',
  'streaming-assistant-tail.json',
  'long-thread-scroll.json',
  'process-timeline-tools.json',
  'hitl-clarification.json',
  'hitl-tool-approval.json',
  'workbench-activity-bash.json',
  'workbench-report-markdown.json',
  'workbench-sources.json',
  'connection-offline-error.json',
  'workbench-sources-retrieval-only.json',
  'rich-session-showcase.json',
  'stock-market-review.json',
  'chat-markdown-gallery.json',
];

export function fixtureTitleFromJson(raw: string, fileName: string): PreviewFixtureDescriptor {
  try {
    const data = JSON.parse(raw) as Record<string, string>;
    return {
      fileName,
      scenarioId: data['scenarioId'] ?? fileName.replace('.json', ''),
      title: data['title'] ?? fileName,
    };
  } catch {
    return { fileName, scenarioId: fileName, title: fileName };
  }
}
