"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { Copy, Check } from "lucide-react";
import { CodeExecutor } from "./code-executor";
import type { ComponentProps } from "react";

// Allow className on code/span/pre for syntax highlighting
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), "className"],
    span: [...(defaultSchema.attributes?.span ?? []), "className"],
    pre: [...(defaultSchema.attributes?.pre ?? []), "className"],
  },
};

interface MarkdownContentProps {
  content: string;
  highlightQuery?: string;
  mentionNames?: string[];
}

function CodeBlockCopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  }, [code]);

  return (
    <button
      onClick={handleCopy}
      className="absolute right-2 top-2 rounded-md bg-neutral-700 p-1.5 text-neutral-400 opacity-0 transition-opacity hover:bg-neutral-600 hover:text-neutral-200 group-hover/code:opacity-100"
      title="Copy code"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-400" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function extractTextFromChildren(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(extractTextFromChildren).join("");
  if (children && typeof children === "object" && "props" in children) {
    return extractTextFromChildren((children as React.ReactElement<{ children?: React.ReactNode }>).props.children);
  }
  return "";
}

/**
 * Extract the language from a code block's className.
 * rehype-highlight adds classes like "hljs language-javascript".
 * ReactMarkdown also adds "language-js" from the markdown fence.
 */
function extractLanguageFromChildren(children: React.ReactNode): string | null {
  if (children && typeof children === "object" && "props" in children) {
    const element = children as React.ReactElement<{ className?: string; children?: React.ReactNode }>;
    const className = element.props.className ?? "";
    const match = className.match(/language-(\w+)/);
    return match ? match[1] : null;
  }
  return null;
}

const JS_LANGUAGES = new Set(["javascript", "js"]);

export function MarkdownContent({ content, highlightQuery, mentionNames }: MarkdownContentProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Highlight matching search text in the DOM after render
  useEffect(() => {
    const el = contentRef.current;
    if (!highlightQuery || !el) return;

    const lowerQ = highlightQuery.toLowerCase();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const matches: { node: Text; start: number; end: number }[] = [];
    let textNode: Text | null;
    while ((textNode = walker.nextNode() as Text | null)) {
      const text = textNode.textContent ?? "";
      let idx = text.toLowerCase().indexOf(lowerQ);
      while (idx >= 0) {
        matches.push({ node: textNode, start: idx, end: idx + highlightQuery.length });
        idx = text.toLowerCase().indexOf(lowerQ, idx + 1);
      }
    }

    // Wrap matches in <mark> (reverse order to keep offsets valid)
    for (let i = matches.length - 1; i >= 0; i--) {
      const { node, start, end } = matches[i];
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);
      const mark = document.createElement("mark");
      mark.className = "search-keyword-highlight";
      range.surroundContents(mark);
    }

    return () => {
      // Clean up marks before next render / unmount
      if (!contentRef.current) return;
      const marks = contentRef.current.querySelectorAll("mark.search-keyword-highlight");
      marks.forEach((m) => {
        const parent = m.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(m.textContent ?? ""), m);
          parent.normalize();
        }
      });
    };
  }, [highlightQuery, content]);

  // Highlight @mentions in the DOM after render
  useEffect(() => {
    const el = contentRef.current;
    if (!el || !mentionNames?.length) return;

    const escapedNames = mentionNames.map((n) =>
      n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    );
    const pattern = new RegExp(`@(${escapedNames.join("|")})(?:\\b|$)`);
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const matches: { node: Text; start: number; end: number }[] = [];
    let textNode: Text | null;
    while ((textNode = walker.nextNode() as Text | null)) {
      const text = textNode.textContent ?? "";
      let offset = 0;
      while (offset < text.length) {
        const sub = text.slice(offset);
        const match = sub.match(pattern);
        if (!match || match.index === undefined) break;
        matches.push({
          node: textNode,
          start: offset + match.index,
          end: offset + match.index + match[0].length,
        });
        offset += match.index + match[0].length;
      }
    }

    for (let i = matches.length - 1; i >= 0; i--) {
      const { node, start, end } = matches[i];
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);
      const span = document.createElement("span");
      span.setAttribute("data-mention", "true");
      span.className = "font-semibold text-blue-400";
      range.surroundContents(span);
    }

    return () => {
      if (!contentRef.current) return;
      const spans = contentRef.current.querySelectorAll("[data-mention]");
      spans.forEach((s) => {
        const parent = s.parentNode;
        if (parent) {
          parent.replaceChild(
            document.createTextNode(s.textContent ?? ""),
            s
          );
          parent.normalize();
        }
      });
    };
  }, [mentionNames, content]);

  return (
    <div ref={contentRef} className="markdown-content text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[
          rehypeHighlight,
          [rehypeSanitize, sanitizeSchema],
        ]}
        components={{
          table(props: ComponentProps<"table">) {
            return (
              <div className="overflow-x-auto">
                <table {...props} />
              </div>
            );
          },
          pre(props: ComponentProps<"pre">) {
            const { children, ...rest } = props;
            const codeText = extractTextFromChildren(children).trim();
            const language = extractLanguageFromChildren(children);
            const isExecutable = language !== null && JS_LANGUAGES.has(language);

            const codeBlock = (
              <div className="group/code relative">
                <pre {...rest}>{children}</pre>
                {codeText && <CodeBlockCopyButton code={codeText} />}
              </div>
            );

            if (isExecutable && codeText) {
              return (
                <CodeExecutor code={codeText}>
                  {codeBlock}
                </CodeExecutor>
              );
            }

            return codeBlock;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

