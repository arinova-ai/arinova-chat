"use client";

import { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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

export function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <div className="markdown-content text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          [rehypeSanitize, sanitizeSchema],
          rehypeHighlight,
        ]}
        components={{
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
