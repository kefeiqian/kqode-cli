import { openUrl } from "@tauri-apps/plugin-opener";
import "highlight.js/styles/github-dark-dimmed.css";
import "katex/dist/katex.min.css";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "./Message.css";

type MarkdownMessageProps = {
  content: string;
  preserveLineBreaks?: boolean;
};

const MARKDOWN_CODE = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g;

function normalizeMathDelimiters(content: string) {
  return content
    .split(MARKDOWN_CODE)
    .map((segment, index) => {
      if (index % 2 === 1) return segment;

      return segment
        .replace(/\\\[([\s\S]*?)\\\]/g, (_, formula: string) => {
          return `\n$$\n${formula.trim()}\n$$\n`;
        })
        .replace(/\\\((.+?)\\\)/g, (_, formula: string) => `$${formula}$`);
    })
    .join("");
}

function isExternalUrl(href: string | undefined) {
  if (!href) return false;
  try {
    const protocol = new URL(href).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

export function MarkdownMessage({
  content,
  preserveLineBreaks = false,
}: MarkdownMessageProps) {
  const normalizedContent = normalizeMathDelimiters(content);

  return (
    <div
      className={`message-content${preserveLineBreaks ? " preserve-line-breaks" : ""}`}
    >
      <ReactMarkdown
        components={{
          a: ({ children, href, ...props }) => (
            <a
              {...props}
              href={href}
              onClick={(event) => {
                if (!href || !isExternalUrl(href)) return;
                event.preventDefault();
                void openUrl(href).catch((error) => {
                  window.alert(`Could not open link: ${String(error)}`);
                });
              }}
              rel="noreferrer"
              target="_blank"
            >
              {children}
            </a>
          ),
        }}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        remarkPlugins={[remarkGfm, remarkMath]}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}
