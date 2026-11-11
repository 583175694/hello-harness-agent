export enum PreviewComposerBlockKind {
  NONE = 0,
  LOGIN_REQUIRED = 1,
  TRANSCRIPT_INCOMPATIBLE = 2,
}

export interface PreviewAuthProfile {
  displayName: string;
  phone: string;
}
