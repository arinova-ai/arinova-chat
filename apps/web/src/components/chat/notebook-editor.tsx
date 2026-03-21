"use client";

import { useEffect, useRef, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import { Mark } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { marked } from "marked";
import DOMPurify from "dompurify";
import TurndownService from "turndown";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  ListChecks,
  Code,
  Quote,
  Link as LinkIcon,
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BACKEND_URL } from "@/lib/config";
import { useTranslation } from "@/lib/i18n";
import { useToastStore } from "@/store/toast-store";
import { SlashCommand } from "./slash-command";
import { DragHandle } from "./drag-handle";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

// Turndown rule for images
turndown.addRule("image", {
  filter: "img",
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const src = el.getAttribute("src") || "";
    const alt = el.getAttribute("alt") || "";
    return `![${alt}](${src})`;
  },
});

// Turndown rule for task list items
turndown.addRule("taskListItem", {
  filter: (node) =>
    node.nodeName === "LI" &&
    node.getAttribute("data-type") === "taskItem",
  replacement: (content, node) => {
    const checked = (node as HTMLElement).getAttribute("data-checked") === "true";
    return `- [${checked ? "x" : " "}] ${content.trim()}\n`;
  },
});

/**
 * WikiLink highlight extension — decorates [[Note Title]] patterns
 * with a distinct visual style. Cosmetic only; link resolution is backend-side.
 */
const WikiLinkHighlight = Mark.create({
  name: "wikiLinkHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            const regex = /\[\[.+?\]\]/g;

            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;
              let match: RegExpExecArray | null;
              while ((match = regex.exec(node.text)) !== null) {
                const from = pos + match.index;
                const to = from + match[0].length;
                decorations.push(
                  Decoration.inline(from, to, {
                    class: "wikilink-highlight",
                  }),
                );
              }
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

interface NotebookEditorProps {
  content: string; // markdown
  onChange?: (markdown: string) => void;
  editable?: boolean;
  placeholder?: string;
  className?: string;
  uploadEndpoint?: string; // default: /api/notes/upload
}

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

function markdownToHtml(md: string): string {
  if (!md) return "";
  return DOMPurify.sanitize(marked.parse(md, { async: false }) as string);
}

function htmlToMarkdown(html: string): string {
  if (!html) return "";
  return turndown.turndown(html);
}

export function NotebookEditor({
  content,
  onChange,
  editable = true,
  placeholder = "Write something...",
  className,
  uploadEndpoint = "/api/notes/upload",
}: NotebookEditorProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadImage = useCallback(async (file: File): Promise<string | null> => {
    if (!file.type.startsWith("image/")) {
      useToastStore.getState().addToast(t("chat.unsupportedFileType"), "error");
      return null;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      useToastStore.getState().addToast("Image must be under 5MB", "error");
      return null;
    }

    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(
        `${BACKEND_URL}${uploadEndpoint}`,
        { method: "POST", body: formData, credentials: "include" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        useToastStore.getState().addToast(body?.error ?? t("chat.uploadFailed"), "error");
        return null;
      }
      const data = await res.json();
      return data.url as string;
    } catch {
      useToastStore.getState().addToast(t("chat.uploadFailed"), "error");
      return null;
    }
  }, [t]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({ placeholder }),
      Underline,
      Link.configure({
        openOnClick: !editable,
        autolink: true,
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ inline: false, allowBase64: false }),
      WikiLinkHighlight,
      ...(editable ? [SlashCommand, DragHandle] : []),
    ],
    content: markdownToHtml(content),
    editable,
    editorProps: {
      attributes: {
        class: `notebook-tiptap-content outline-none min-h-[200px] py-2 text-sm ${editable ? "pl-7 pr-3" : "px-3"}`,
      },
      handlePaste: (view, event) => {
        if (!editable) return false;
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of items) {
          if (item.type.startsWith("image/")) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) {
              uploadImage(file).then((url) => {
                if (url && view.state) {
                  const node = view.state.schema.nodes.image.create({ src: url });
                  const tr = view.state.tr.replaceSelectionWith(node);
                  view.dispatch(tr);
                }
              });
            }
            return true;
          }
        }
        return false;
      },
      handleDrop: (view, event) => {
        if (!editable) return false;
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        const file = files[0];
        if (!file.type.startsWith("image/")) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
        uploadImage(file).then((url) => {
          if (url && view.state) {
            const node = view.state.schema.nodes.image.create({ src: url });
            const insertPos = pos?.pos ?? view.state.selection.from;
            const tr = view.state.tr.insert(insertPos, node);
            view.dispatch(tr);
          }
        });
        return true;
      },
    },
    onUpdate: ({ editor: e }) => {
      onChange?.(htmlToMarkdown(e.getHTML()));
    },
  });

  // Sync content from outside (e.g., switching notes)
  useEffect(() => {
    if (!editor) return;
    const currentMd = htmlToMarkdown(editor.getHTML());
    if (currentMd.trim() !== content.trim()) {
      editor.commands.setContent(markdownToHtml(content));
    }
  }, [content, editor]);

  // Sync editable state
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editable, editor]);

  if (!editor) return null;

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Toolbar — only show in editable mode */}
      {editable && (
        <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1.5">
          <ToolbarButton
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold"
          >
            <Bold className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italic"
          >
            <Italic className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="Underline"
          >
            <UnderlineIcon className="h-3.5 w-3.5" />
          </ToolbarButton>
          <div className="mx-1 h-4 w-px bg-border" />
          <ToolbarButton
            active={editor.isActive("heading", { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            title="Heading 1"
          >
            <Heading1 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("heading", { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Heading 2"
          >
            <Heading2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <div className="mx-1 h-4 w-px bg-border" />
          <ToolbarButton
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Bullet List"
          >
            <List className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Ordered List"
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("taskList")}
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            title="Task List"
          >
            <ListChecks className="h-3.5 w-3.5" />
          </ToolbarButton>
          <div className="mx-1 h-4 w-px bg-border" />
          <ToolbarButton
            active={editor.isActive("codeBlock")}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            title="Code Block"
          >
            <Code className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="Quote"
          >
            <Quote className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("link")}
            onClick={() => {
              if (editor.isActive("link")) {
                editor.chain().focus().unsetLink().run();
              } else {
                const url = window.prompt("URL:");
                if (url && /^(https?:\/\/|mailto:)/i.test(url)) {
                  editor.chain().focus().setLink({ href: url }).run();
                }
              }
            }}
            title="Link"
          >
            <LinkIcon className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={false}
            onClick={() => fileInputRef.current?.click()}
            title="Image"
          >
            <ImageIcon className="h-3.5 w-3.5" />
          </ToolbarButton>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && editor) {
                uploadImage(file).then((url) => {
                  if (url) {
                    editor.chain().focus().setImage({ src: url }).run();
                  }
                });
              }
              e.target.value = "";
            }}
          />
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "rounded p-1.5 transition-colors hover:bg-accent",
        active && "bg-accent text-accent-foreground",
      )}
    >
      {children}
    </button>
  );
}
