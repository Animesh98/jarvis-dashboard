'use client';

import { useEffect, useRef } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code as CodeIcon,
  SquareCode,
  Link as LinkIcon,
  Unlink,
  Undo2,
  Redo2,
} from 'lucide-react';
import styles from './RichEditor.module.scss';

interface RichEditorProps {
  value: string;
  onChange: (html: string) => void;
  selectionKey: string | null; // changes when the user picks a different note — triggers content reset
  placeholder?: string;
}

export default function RichEditor({
  value,
  onChange,
  selectionKey,
  placeholder = 'Start writing…',
}: RichEditorProps) {
  const lastLoadedKey = useRef<string | null>(null);

  const editor = useEditor({
    immediatelyRender: false, // avoid SSR hydration mismatch (Next.js)
    extensions: [
      StarterKit.configure({
        link: false, // we add the Link extension explicitly so we can configure it
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          rel: 'noopener noreferrer nofollow',
          target: '_blank',
        },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || '',
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: styles.contentArea,
      },
    },
  });

  // Reset content only when the selected note changes — not on every value prop tick
  // (prevents cursor jump while typing, since auto-save updates the parent).
  // emitUpdate: false is critical — TipTap v3's setContent defaults to firing
  // the update event, which would call onChange → setDirty(true) and trigger
  // an autosave just for opening a note, bumping updated_at without any edit.
  useEffect(() => {
    if (!editor) return;
    if (selectionKey === lastLoadedKey.current) return;
    lastLoadedKey.current = selectionKey;
    editor.commands.setContent(value || '', { emitUpdate: false });
  }, [editor, selectionKey, value]);

  if (!editor) return <div className={styles.contentArea} />;

  return (
    <div className={styles.editorRoot}>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} className={styles.editorSurface} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const setLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined;
    const input = window.prompt('URL (leave blank to remove):', previous || 'https://');
    if (input === null) return; // cancelled
    if (input.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: input.trim() }).run();
  };

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Formatting">
      <ToolbarBtn
        title="Bold (Ctrl+B)"
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold size={13} />
      </ToolbarBtn>
      <ToolbarBtn
        title="Italic (Ctrl+I)"
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic size={13} />
      </ToolbarBtn>
      <ToolbarBtn
        title="Strikethrough"
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough size={13} />
      </ToolbarBtn>

      <span className={styles.divider} aria-hidden />

      <ToolbarBtn
        title="Heading 1"
        active={editor.isActive('heading', { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 size={13} />
      </ToolbarBtn>
      <ToolbarBtn
        title="Heading 2"
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 size={13} />
      </ToolbarBtn>
      <ToolbarBtn
        title="Heading 3"
        active={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 size={13} />
      </ToolbarBtn>

      <span className={styles.divider} aria-hidden />

      <ToolbarBtn
        title="Bullet list"
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List size={13} />
      </ToolbarBtn>
      <ToolbarBtn
        title="Numbered list"
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered size={13} />
      </ToolbarBtn>
      <ToolbarBtn
        title="Quote"
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote size={13} />
      </ToolbarBtn>

      <span className={styles.divider} aria-hidden />

      <ToolbarBtn
        title="Inline code"
        active={editor.isActive('code')}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <CodeIcon size={13} />
      </ToolbarBtn>
      <ToolbarBtn
        title="Code block"
        active={editor.isActive('codeBlock')}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <SquareCode size={13} />
      </ToolbarBtn>
      <ToolbarBtn
        title={editor.isActive('link') ? 'Edit link' : 'Add link (Ctrl+K)'}
        active={editor.isActive('link')}
        onClick={setLink}
      >
        <LinkIcon size={13} />
      </ToolbarBtn>
      {editor.isActive('link') && (
        <ToolbarBtn title="Remove link" onClick={() => editor.chain().focus().unsetLink().run()}>
          <Unlink size={13} />
        </ToolbarBtn>
      )}

      <span className={styles.spacer} />

      <ToolbarBtn
        title="Undo (Ctrl+Z)"
        disabled={!editor.can().chain().focus().undo().run()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2 size={13} />
      </ToolbarBtn>
      <ToolbarBtn
        title="Redo (Ctrl+Shift+Z)"
        disabled={!editor.can().chain().focus().redo().run()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2 size={13} />
      </ToolbarBtn>
    </div>
  );
}

function ToolbarBtn({
  title,
  active,
  disabled,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={!!active}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={`${styles.toolbarBtn} ${active ? styles.toolbarBtnActive : ''}`}
    >
      {children}
    </button>
  );
}
