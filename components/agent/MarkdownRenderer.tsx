'use client';

import { useMemo, type ReactNode } from 'react';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url, 'https://');
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let key = 0;

  for (const match of text.matchAll(regex)) {
    if (match.index !== undefined && match.index > lastIndex) {
      parts.push(<span key={key++}>{escapeHtml(text.slice(lastIndex, match.index))}</span>);
    }

    if (match[2]) {
      parts.push(<strong key={key++}>{escapeHtml(match[2])}</strong>);
    } else if (match[4]) {
      parts.push(<em key={key++}>{escapeHtml(match[4])}</em>);
    } else if (match[6]) {
      parts.push(<code key={key++} className="bg-muted/50 px-1 py-0.5 rounded text-xs font-mono">{escapeHtml(match[6])}</code>);
    } else if (match[8] && match[9]) {
      const url = match[9];
      if (isValidUrl(url)) {
        parts.push(<a key={key++} href={url} target="_blank" rel="noopener noreferrer" className="underline text-[var(--nexus-cyan)]">{escapeHtml(match[8])}</a>);
      } else {
        parts.push(<span key={key++}>{escapeHtml(match[8])}</span>);
      }
    }

    lastIndex = (match.index || 0) + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{escapeHtml(text.slice(lastIndex))}</span>);
  }

  return parts;
}

function parseLines(content: string): ReactNode[] {
  const blocks: ReactNode[] = [];
  let key = 0;

  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      const startIdx = i;
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      const foundClosing = i < lines.length;
      if (foundClosing) i++;

      blocks.push(
        <pre key={key++} className="bg-muted/70 rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono border border-border/60">
          <code>{escapeHtml(codeLines.join('\n'))}</code>
          {!foundClosing && <span className="block text-[10px] text-muted-foreground/60 mt-1 italic">(unclosed code block)</span>}
        </pre>
      );
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const Tag = level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5';
      blocks.push(
        <Tag key={key++} className="font-semibold mt-3 mb-1">
          {renderInline(text)}
        </Tag>
      );
      i++;
      continue;
    }

    // Unordered list
    if (line.match(/^[-*]\s+/)) {
      const items: ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^[-*]\s+/)) {
        const itemText = lines[i].replace(/^[-*]\s+/, '');
        items.push(
          <li key={key++} className="list-disc ml-4 text-sm">
            {renderInline(itemText)}
          </li>
        );
        i++;
      }
      blocks.push(<ul key={key++} className="space-y-0.5 my-1">{items}</ul>);
      continue;
    }

    // Ordered list
    if (line.match(/^\d+\.\s+/)) {
      const items: ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s+/)) {
        const itemText = lines[i].replace(/^\d+\.\s+/, '');
        items.push(
          <li key={key++} className="list-decimal ml-4 text-sm">
            {renderInline(itemText)}
          </li>
        );
        i++;
      }
      blocks.push(<ol key={key++} className="space-y-0.5 my-1">{items}</ol>);
      continue;
    }

    // Horizontal rule
    if (line.match(/^---+\s*$/)) {
      blocks.push(<hr key={key++} className="my-2 border-border/60" />);
      i++;
      continue;
    }

    // Empty line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Regular paragraph - collect consecutive non-empty lines
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() && !lines[i].match(/^(#{1,3}|[-*]\s+|\d+\.\s+|```|---+)/)) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push(
        <p key={key++} className="text-sm whitespace-pre-wrap break-words my-1">
          {paraLines.map((paraLine, idx) => (
            <span key={idx}>{renderInline(paraLine)}{idx < paraLines.length - 1 && <br />}</span>
          ))}
        </p>
      );
    }
  }

  return blocks;
}

export function MarkdownRenderer({ content, className }: { content: string; className?: string }) {
  const rendered = useMemo(() => parseLines(content), [content]);
  return <div className={className}>{rendered}</div>;
}
