"use client";

import { Extension, type Editor } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionOptions, type SuggestionProps } from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  useCallback,
} from "react";
import {
  Heading1,
  Heading2,
  List,
  ListOrdered,
  ListChecks,
  Code,
  Quote,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CommandItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  command: (props: { editor: Editor; range: SuggestionProps["range"] }) => void;
}

const SLASH_ITEMS: CommandItem[] = [
  {
    title: "Heading 1",
    description: "Large heading",
    icon: <Heading1 className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
    },
  },
  {
    title: "Heading 2",
    description: "Medium heading",
    icon: <Heading2 className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
    },
  },
  {
    title: "Bullet List",
    description: "Unordered list",
    icon: <List className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: "Ordered List",
    description: "Numbered list",
    icon: <ListOrdered className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: "Task List",
    description: "Checklist with checkboxes",
    icon: <ListChecks className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    title: "Code Block",
    description: "Fenced code block",
    icon: <Code className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    title: "Blockquote",
    description: "Quote block",
    icon: <Quote className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
];

interface CommandListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const CommandList = forwardRef<CommandListRef, SuggestionProps>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const items = (props.items ?? []) as CommandItem[];

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  const selectItem = useCallback(
    (index: number) => {
      const item = items[index];
      if (item) {
        props.command(item);
      }
    },
    [items, props],
  );

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex((i) => (i + items.length - 1) % items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === "Enter") {
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) return null;

  return (
    <div className="z-50 min-w-[200px] rounded-lg border border-border bg-popover p-1 shadow-md">
      {items.map((item, index) => (
        <button
          key={item.title}
          type="button"
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
            index === selectedIndex
              ? "bg-accent text-accent-foreground"
              : "text-foreground hover:bg-accent/60",
          )}
          onClick={() => selectItem(index)}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded bg-muted text-muted-foreground">
            {item.icon}
          </span>
          <div>
            <p className="text-sm font-medium">{item.title}</p>
            <p className="text-[11px] text-muted-foreground">{item.description}</p>
          </div>
        </button>
      ))}
    </div>
  );
});
CommandList.displayName = "CommandList";

const suggestion: Omit<SuggestionOptions<CommandItem>, "editor"> = {
  items: ({ query }: { query: string }) => {
    return SLASH_ITEMS.filter((item) =>
      item.title.toLowerCase().includes(query.toLowerCase()),
    );
  },
  render: () => {
    let component: ReactRenderer<CommandListRef> | null = null;
    let popup: TippyInstance[] | null = null;

    return {
      onStart: (props: SuggestionProps) => {
        component = new ReactRenderer(CommandList, {
          props,
          editor: props.editor,
        });

        if (!props.clientRect) return;

        popup = tippy("body", {
          getReferenceClientRect: props.clientRect as () => DOMRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: "manual",
          placement: "bottom-start",
        });
      },
      onUpdate: (props: SuggestionProps) => {
        component?.updateProps(props);
        if (popup?.[0] && props.clientRect) {
          popup[0].setProps({ getReferenceClientRect: props.clientRect as () => DOMRect });
        }
      },
      onKeyDown: (props: { event: KeyboardEvent }) => {
        if (props.event.key === "Escape") {
          popup?.[0]?.hide();
          return true;
        }
        return component?.ref?.onKeyDown(props) ?? false;
      },
      onExit: () => {
        popup?.[0]?.destroy();
        component?.destroy();
      },
    };
  },
};

export const SlashCommand = Extension.create({
  name: "slashCommand",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        command: ({ editor, range, props }: { editor: Editor; range: SuggestionProps["range"]; props: CommandItem }) => {
          props.command({ editor, range });
        },
        ...suggestion,
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
