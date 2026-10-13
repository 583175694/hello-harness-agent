import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import type { LexicalEditor } from 'lexical';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';

import { ComposerControlledPlugin } from './composer-controlled-plugin';
import { runSkillComposerBackspace } from './composer-skill-key-commands';
import { ComposerSkillKeyPlugin } from './composer-skill-key-plugin';
import { ComposerSubmitPlugin } from './composer-submit-plugin';
import {
  $clearComposerEditor,
  $extractComposerDocument,
  $insertSkillMentionAtSelection,
  type ComposerDocumentValue,
} from './skill-editor-utils';
import { skillEditorTheme } from './skill-editor-theme';
import { SkillMentionNode } from './skill-mention-node';
import { SkillTypeaheadPlugin } from './skill-typeahead-plugin';

export type SkillPromptEditorHandle = {
  clear: () => void;
  insertSkillMention: (name: string, label: string) => void;
  focus: () => void;
};

export const SkillPromptEditor = forwardRef(function SkillPromptEditor(
  {
    placeholder,
    disabled,
    enableSkills,
    resetKey,
    seedPlainText,
    onChange,
    onBlurSync,
    onSubmitRequest,
    onPaste,
  }: {
    placeholder: string;
    disabled: boolean;
    enableSkills: boolean;
    resetKey: number;
    seedPlainText: string;
    onChange: (value: ComposerDocumentValue) => void;
    onBlurSync: (plainText: string) => void;
    onSubmitRequest: () => void;
    onPaste?: (event: React.ClipboardEvent<HTMLDivElement>) => void;
  },
  ref: React.ForwardedRef<SkillPromptEditorHandle>,
) {
  const editorRef = useRef<LexicalEditor | null>(null);

  const initialConfig = useMemo(
    () => ({
      namespace: 'HarnessSkillComposer',
      theme: skillEditorTheme,
      editable: !disabled,
      nodes: [SkillMentionNode],
      onError(error: Error) {
        console.error(error);
      },
    }),
    [disabled],
  );

  const handleChange = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.read(() => {
      onChange($extractComposerDocument());
    });
  }, [onChange]);

  const handleBlurSync = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.read(() => {
      onBlurSync($extractComposerDocument().plainText);
    });
  }, [onBlurSync]);

  useImperativeHandle(
    ref,
    () => ({
      clear() {
        const editor = editorRef.current;
        if (!editor) return;
        editor.update(() => {
          $clearComposerEditor();
        });
        onChange({ plainText: '', skillNames: [] });
      },
      insertSkillMention(name: string, label: string) {
        const editor = editorRef.current;
        if (!editor) return;
        editor.update(() => {
          $insertSkillMentionAtSelection(name, label);
        });
        editor.read(() => {
          onChange($extractComposerDocument());
        });
      },
      focus() {
        editorRef.current?.focus(undefined, { defaultSelection: 'rootEnd' });
      },
    }),
    [onChange],
  );

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <EditorRefCapture editorRef={editorRef} disabled={disabled} />
      <PlainTextPlugin
        contentEditable={
          <ContentEditable
            aria-label="任务输入"
            className="ai-prompt-input__textarea skill-composer-input"
            onBlur={handleBlurSync}
            onPaste={onPaste}
            onKeyDownCapture={(event) => {
              if (event.key !== 'Backspace' || event.metaKey || event.ctrlKey || event.altKey) return;
              const editor = editorRef.current;
              if (!editor || disabled) return;
              if (runSkillComposerBackspace(editor)) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
          />
        }
        placeholder={
          <div className="skill-composer-placeholder" aria-hidden="true">
            {placeholder}
          </div>
        }
        ErrorBoundary={LexicalErrorBoundary}
      />
      <HistoryPlugin />
      <OnChangePlugin ignoreSelectionChange onChange={handleChange} />
      <ComposerControlledPlugin resetKey={resetKey} seedPlainText={seedPlainText} />
      <ComposerSubmitPlugin disabled={disabled} onSubmitRequest={onSubmitRequest} />
      {enableSkills ? (
        <>
          <ComposerSkillKeyPlugin />
          <SkillTypeaheadPlugin enabled={!disabled} />
        </>
      ) : null}
    </LexicalComposer>
  );
});

function EditorRefCapture({
  editorRef,
  disabled,
}: {
  editorRef: React.MutableRefObject<LexicalEditor | null>;
  disabled: boolean;
}) {
  const [editor] = useLexicalComposerContext();
  editorRef.current = editor;
  useEffect(() => {
    editor.setEditable(!disabled);
  }, [disabled, editor]);
  return null;
}
