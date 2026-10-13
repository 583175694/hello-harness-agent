import { BookOpen, X } from 'lucide-react';
import {
  $applyNodeReplacement,
  $getNodeByKey,
  DecoratorNode,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';
import type { JSX } from 'react';

export type SerializedSkillMentionNode = Spread<
  {
    name: string;
    label: string;
    type: 'skill-mention';
    version: 1;
  },
  SerializedLexicalNode
>;

export class SkillMentionNode extends DecoratorNode<JSX.Element> {
  __name: string;
  __label: string;

  static override getType(): string {
    return 'skill-mention';
  }

  static override clone(node: SkillMentionNode): SkillMentionNode {
    return new SkillMentionNode(node.__name, node.__label, node.__key);
  }

  constructor(name: string, label: string, key?: NodeKey) {
    super(key);
    this.__name = name;
    this.__label = label;
  }

  getSkillName(): string {
    return this.getLatest().__name;
  }

  getSkillLabel(): string {
    return this.getLatest().__label;
  }

  override createDOM(): HTMLElement {
    return document.createElement('span');
  }

  override updateDOM(): false {
    return false;
  }

  override exportDOM(): DOMExportOutput {
    const element = document.createElement('span');
    element.setAttribute('data-skill-name', this.__name);
    element.textContent = this.__label;
    return { element };
  }

  static override importJSON(serializedNode: SerializedSkillMentionNode): SkillMentionNode {
    return $createSkillMentionNode(serializedNode.name, serializedNode.label);
  }

  override exportJSON(): SerializedSkillMentionNode {
    return {
      type: 'skill-mention',
      version: 1,
      name: this.__name,
      label: this.__label,
    };
  }

  override getTextContent(): string {
    return '';
  }

  override isInline(): boolean {
    return true;
  }

  override isIsolated(): boolean {
    return true;
  }

  override isKeyboardSelectable(): boolean {
    return true;
  }

  override decorate(editor: LexicalEditor, _config: EditorConfig): JSX.Element {
    const name = this.__name;
    const label = this.__label;
    const nodeKey = this.getKey();
    return (
      <span
        className="composer-skill-chip composer-skill-mention"
        contentEditable={false}
        data-skill-name={name}
      >
        <BookOpen size={14} aria-hidden="true" />
        <span>{label}</span>
        <button
          type="button"
          aria-label={`移除 Skill ${label}`}
          title={`移除 ${label}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            editor.update(() => {
              const node = $getNodeByKey(nodeKey);
              if ($isSkillMentionNode(node)) node.remove();
            });
          }}
          onMouseDown={(event) => event.preventDefault()}
        >
          <X size={12} aria-hidden="true" />
        </button>
      </span>
    );
  }
}

export function $createSkillMentionNode(name: string, label: string): SkillMentionNode {
  return $applyNodeReplacement(new SkillMentionNode(name, label));
}

export function $isSkillMentionNode(
  node: LexicalNode | null | undefined,
): node is SkillMentionNode {
  return node instanceof SkillMentionNode;
}
