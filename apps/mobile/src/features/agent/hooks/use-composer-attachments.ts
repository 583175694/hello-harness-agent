import type { FileRef } from '@harness/agent-protocol';
import type { ComposerAttachmentFixture } from '../fixtures/ui-fixtures';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import type { ImagePickerAsset } from 'expo-image-picker';
import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';

import {
  guessUploadMimeType,
  inferUploadFileName,
  isSupportedUploadMime,
} from '@/lib/guess-upload-mime';
import { uploadSessionFileFromUri, uploadSessionTextFile } from '@/lib/upload-session-file';
import { ApiProblem } from '@harness/agent-client';

import { AGENT_UI_BEHAVIOR } from '../config/ui.constants';
import { resolveLongTextPaste } from '../lib/composer-paste';
import { useAgentHostSession } from './use-agent-host';

function fileKindFromRef(fileKind?: string): 'file' | 'image' {
  return fileKind === 'image' ? 'image' : 'file';
}

function fixtureStatusFromFileRef(fileRef: FileRef): ComposerAttachmentFixture['status'] {
  if (fileRef.status === 'failed') return 'failed';
  if (fileRef.status === 'processing') return 'processing';
  return 'ready';
}

function isPendingAttachmentId(id: string): boolean {
  return id.startsWith('upload-');
}

type LocalUriSource = {
  kind: 'uri';
  sessionId: string;
  uri: string;
  name: string;
  mimeType: string;
  attachmentKind: 'file' | 'image';
};

type LocalTextSource = {
  kind: 'text';
  sessionId: string;
  text: string;
  fileName: string;
};

type LocalAttachmentSource = LocalUriSource | LocalTextSource;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function guessImageMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

export function readyComposerAttachmentsAsFileRefs(
  items: ComposerAttachmentFixture[],
): FileRef[] {
  return items
    .filter((item) => item.status === 'ready')
    .map((item) => ({
      fileId: item.id,
      fileName: item.fileName,
      mediaType:
        item.kind === 'image'
          ? guessImageMimeType(item.fileName)
          : guessUploadMimeType(item.fileName),
      size: item.size,
      status: 'ready' as const,
      fileKind: item.kind === 'image' ? ('image' as const) : undefined,
      previewUrl: item.previewUri,
    }));
}

const UPLOAD_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

function uploadFailureMessage(error: unknown): string {
  if (error instanceof ApiProblem) return error.problem.detail;
  if (error instanceof Error && error.message) return error.message;
  return '上传失败，请稍后重试。';
}

function normalizePickedImageMeta(asset: ImagePickerAsset): { name: string; mimeType: string } {
  let name = asset.fileName ?? `image-${asset.assetId ?? Date.now()}.jpg`;
  let mimeType = guessUploadMimeType(name, asset.mimeType ?? 'image/jpeg');

  if (mimeType === 'image/heic' || mimeType === 'image/heif') {
    mimeType = 'image/jpeg';
    name = name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg');
  }
  if (!UPLOAD_IMAGE_MIME.has(mimeType)) {
    mimeType = 'image/jpeg';
  }
  if (!/\.(png|jpe?g|webp)$/i.test(name)) {
    const base = name.includes('.') ? name.replace(/\.[^.]+$/, '') : name;
    name = `${base}.${mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'}`;
  }
  return { name, mimeType };
}

export function useComposerAttachments() {
  const { client, apiBaseUrl, selectedSessionId, createSession } = useAgentHostSession();
  const [items, setItems] = useState<ComposerAttachmentFixture[]>([]);
  const controllersRef = useRef<Record<string, AbortController>>({});
  const localSourcesRef = useRef<Record<string, LocalAttachmentSource>>({});
  const pickerBusyRef = useRef(false);

  const ensureSessionId = useCallback(async (): Promise<string | null> => {
    if (selectedSessionId) return selectedSessionId;
    const created = await createSession('新对话');
    if (created?.id) return created.id;
    Alert.alert('无法上传', '请先确认 API 已连接（顶栏地址可达），再重试。');
    return null;
  }, [createSession, selectedSessionId]);

  const applyFileRef = useCallback(
    (tempId: string, fileRef: FileRef, previewUri?: string) => {
      setItems((prev) =>
        prev.map((item) =>
          item.id === tempId
            ? {
                id: fileRef.fileId,
                fileName: fileRef.fileName,
                size: fileRef.size,
                kind: fileKindFromRef(fileRef.fileKind),
                status: fixtureStatusFromFileRef(fileRef),
                previewUri: previewUri ?? item.previewUri,
              }
            : item,
        ),
      );
      const source = localSourcesRef.current[tempId];
      if (source) {
        localSourcesRef.current[fileRef.fileId] = source;
        delete localSourcesRef.current[tempId];
      }
      delete controllersRef.current[tempId];
    },
    [],
  );

  const pollFileProcessing = useCallback(
    async (fileId: string) => {
      for (let attempt = 0; attempt < 140; attempt += 1) {
        await sleep(250);
        try {
          const current = await client.getFile(fileId);
          setItems((prev) =>
            prev.map((item) =>
              item.id === fileId
                ? {
                    ...item,
                    fileName: current.fileName,
                    size: current.size,
                    status: fixtureStatusFromFileRef(current),
                  }
                : item,
            ),
          );
          if (current.status !== 'processing') return;
        } catch {
          return;
        }
      }
    },
    [client],
  );

  const uploadWithTempId = useCallback(
    async (
      tempId: string,
      sessionId: string,
      source: LocalAttachmentSource,
      previewUri?: string,
    ) => {
      const controller = new AbortController();
      controllersRef.current[tempId] = controller;
      localSourcesRef.current[tempId] = source;
      try {
        const fileRef =
          source.kind === 'text'
            ? await uploadSessionTextFile(
                apiBaseUrl,
                sessionId,
                source.text,
                source.fileName,
                controller.signal,
              )
            : await uploadSessionFileFromUri(
                apiBaseUrl,
                sessionId,
                { uri: source.uri, name: source.name, mimeType: source.mimeType },
                controller.signal,
              );
        applyFileRef(tempId, fileRef, previewUri);
        if (fileRef.status === 'processing') {
          await pollFileProcessing(fileRef.fileId);
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        Alert.alert('上传失败', uploadFailureMessage(error));
        setItems((prev) =>
          prev.map((item) => (item.id === tempId ? { ...item, status: 'failed' } : item)),
        );
      }
    },
    [apiBaseUrl, applyFileRef, pollFileProcessing],
  );

  const uploadLocal = useCallback(
    async (
      sessionId: string,
      local: { uri: string; name: string; mimeType: string; kind: 'file' | 'image' },
    ) => {
      const tempId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setItems((prev) => [
        ...prev,
        {
          id: tempId,
          fileName: local.name,
          size: 0,
          kind: local.kind,
          status: 'processing',
          previewUri: local.kind === 'image' ? local.uri : undefined,
        },
      ]);
      await uploadWithTempId(
        tempId,
        sessionId,
        {
          kind: 'uri',
          sessionId,
          uri: local.uri,
          name: local.name,
          mimeType: local.mimeType,
          attachmentKind: local.kind,
        },
        local.kind === 'image' ? local.uri : undefined,
      );
    },
    [uploadWithTempId],
  );

  const uploadPastedText = useCallback(
    async (sessionId: string, text: string, fileName: string) => {
      const tempId = `upload-paste-${Date.now()}`;
      setItems((prev) => [
        ...prev,
        {
          id: tempId,
          fileName,
          size: text.length,
          kind: 'file' as const,
          status: 'processing',
        },
      ]);
      await uploadWithTempId(tempId, sessionId, {
        kind: 'text',
        sessionId,
        text,
        fileName,
      });
    },
    [uploadWithTempId],
  );

  const pickImages = useCallback(async () => {
    if (pickerBusyRef.current) return;
    pickerBusyRef.current = true;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.92,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (result.canceled || !result.assets?.length) {
        const permission = await ImagePicker.getMediaLibraryPermissionsAsync();
        if (!permission.granted && permission.canAskAgain === false) {
          Alert.alert('需要相册权限', '请在系统设置中允许访问照片。');
        }
        return;
      }
      const sessionId = await ensureSessionId();
      if (!sessionId) return;
      for (const asset of result.assets) {
        const { name, mimeType } = normalizePickedImageMeta(asset);
        await uploadLocal(sessionId, { uri: asset.uri, name, mimeType, kind: 'image' });
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('[pickImages]', error);
      }
    } finally {
      pickerBusyRef.current = false;
    }
  }, [ensureSessionId, uploadLocal]);

  const pickFiles = useCallback(async () => {
    if (pickerBusyRef.current) return;
    pickerBusyRef.current = true;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const sessionId = await ensureSessionId();
      if (!sessionId) return;
      for (const asset of result.assets) {
        const name = inferUploadFileName(asset.name ?? 'upload.bin', asset.uri);
        const mimeType = guessUploadMimeType(name, asset.mimeType);
        if (!isSupportedUploadMime(mimeType)) {
          Alert.alert(
            '不支持的文件类型',
            '仅支持图片、TXT、Markdown、CSV、JSON、PDF、DOCX、XLSX、PPTX。',
          );
          continue;
        }
        await uploadLocal(sessionId, { uri: asset.uri, name, mimeType, kind: 'file' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('PickingInProgress')) return;
      Alert.alert('无法打开文件', '请稍后再试。');
      if (__DEV__) {
        console.warn('[pickFiles]', error);
      }
    } finally {
      pickerBusyRef.current = false;
    }
  }, [ensureSessionId, uploadLocal]);

  const removeItem = useCallback(
    (id: string) => {
      controllersRef.current[id]?.abort();
      delete controllersRef.current[id];
      delete localSourcesRef.current[id];
      setItems((prev) => prev.filter((item) => item.id !== id));
      if (!isPendingAttachmentId(id)) {
        void client.deleteFile(id).catch(() => undefined);
      }
    },
    [client],
  );

  const retryItem = useCallback(
    async (id: string) => {
      const local = localSourcesRef.current[id];
      if (local) {
        removeItem(id);
        const tempId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const previewUri =
          local.kind === 'uri' && local.attachmentKind === 'image' ? local.uri : undefined;
        setItems((prev) => [
          ...prev,
          {
            id: tempId,
            fileName: local.kind === 'text' ? local.fileName : local.name,
            size: local.kind === 'text' ? local.text.length : 0,
            kind: local.kind === 'uri' ? local.attachmentKind : 'file',
            status: 'processing',
            previewUri,
          },
        ]);
        await uploadWithTempId(tempId, local.sessionId, local, previewUri);
        return;
      }
      if (isPendingAttachmentId(id)) return;
      try {
        const retried = await client.retryFile(id);
        setItems((prev) =>
          prev.map((item) =>
            item.id === id
              ? {
                  ...item,
                  fileName: retried.fileName,
                  size: retried.size,
                  status: fixtureStatusFromFileRef(retried),
                }
              : item,
          ),
        );
        if (retried.status === 'processing') {
          await pollFileProcessing(id);
        }
      } catch {
        setItems((prev) =>
          prev.map((item) => (item.id === id ? { ...item, status: 'failed' } : item)),
        );
      }
    },
    [client, pollFileProcessing, removeItem, uploadWithTempId],
  );

  const clearItems = useCallback(() => {
    for (const id of Object.keys(controllersRef.current)) {
      controllersRef.current[id]?.abort();
    }
    controllersRef.current = {};
    localSourcesRef.current = {};
    setItems([]);
  }, []);

  const reconcileDraftChange = useCallback(
    (before: string, after: string): string => {
      const decision = resolveLongTextPaste({
        before,
        after,
        attachments: items,
        thresholdCodePoints: AGENT_UI_BEHAVIOR.longPasteThresholdCodePoints,
      });
      if (decision.kind === 'keep') return decision.draft;
      void ensureSessionId().then((sessionId) => {
        if (!sessionId) return;
        void uploadPastedText(sessionId, decision.text, decision.fileName);
      });
      return decision.draft;
    },
    [ensureSessionId, items, uploadPastedText],
  );

  const attachmentIds = items.filter((item) => item.status === 'ready').map((item) => item.id);

  return {
    items,
    attachmentIds,
    pickImages,
    pickFiles,
    reconcileDraftChange,
    retryItem,
    removeItem,
    clearItems,
  };
}
