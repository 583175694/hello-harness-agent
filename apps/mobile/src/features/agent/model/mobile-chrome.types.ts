export type WorkbenchSheetDetent = 'closed' | 'peek' | 'half' | 'full';

/** 仅本地 UI；不参与 Snapshot（对齐 doc 36 §9.2）。 */
export type MobileChromeState = {
  sessionDrawerOpen: boolean;
  workbenchSheet: {
    detent: WorkbenchSheetDetent;
    userExpanded: boolean;
  };
  apiBaseUrl: string;
  pushNotificationsEnabled: boolean;
};

export type MobileServiceState = 'checking' | 'ready' | 'unavailable';
