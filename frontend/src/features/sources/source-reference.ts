export type SourceReference = {
  id?: string;
  url: string;
  title: string;
  description?: string;
};

export type SourceTextSegment =
  | { kind: "text"; text: string }
  | { kind: "link"; href: string; label: string };

export function safeSourceUrl(value: unknown): string | null {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value) || /[\u0000-\u0020\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function sourceDomain(value: string): string | null {
  const safe = safeSourceUrl(value);
  if (!safe) return null;
  return new URL(safe).hostname.replace(/^www\./i, "");
}

function markdownLinkAt(text: string, start: number): { end: number; href: string; label: string } | null {
  const labelEnd = text.indexOf("](", start + 1);
  if (labelEnd < 0) return null;
  const label = text.slice(start + 1, labelEnd);
  if (!label || label.includes("\n")) return null;

  const urlStart = labelEnd + 2;
  let nested = 0;
  for (let index = urlStart; index < text.length; index++) {
    const character = text[index];
    if (/\s/.test(character)) return null;
    if (character === "(") nested++;
    if (character !== ")") continue;
    if (nested > 0) {
      nested--;
      continue;
    }
    const href = safeSourceUrl(text.slice(urlStart, index));
    return href ? { end: index + 1, href, label } : null;
  }
  return null;
}

function trimBareUrl(candidate: string): string {
  let result = candidate.replace(/[.,!?;:\u3002\uff0c\uff01\uff1f]+$/u, "");
  for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"]] as const) {
    while (result.endsWith(close) && result.split(close).length > result.split(open).length) result = result.slice(0, -1);
  }
  return result;
}

function bareLinkAt(text: string, start: number): { start: number; end: number; href: string; label: string } | null {
  let searchFrom = start;
  while (searchFrom < text.length) {
    const match = /https?:\/\//i.exec(text.slice(searchFrom));
    if (!match) return null;
    const linkStart = searchFrom + match.index;
    let end = linkStart;
    while (end < text.length && !/[\s<>"']/.test(text[end])) end++;
    const label = trimBareUrl(text.slice(linkStart, end));
    const href = safeSourceUrl(label);
    if (href) return { start: linkStart, end: linkStart + label.length, href, label };
    searchFrom = Math.max(end, linkStart + match[0].length);
  }
  return null;
}

function appendText(segments: SourceTextSegment[], text: string) {
  if (!text) return;
  const last = segments.at(-1);
  if (last?.kind === "text") last.text += text;
  else segments.push({ kind: "text", text });
}

export function parseSourceText(text: string): SourceTextSegment[] {
  const segments: SourceTextSegment[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let markdownStart = text.indexOf("[", cursor);
    let markdown: ReturnType<typeof markdownLinkAt> = null;
    while (markdownStart >= 0 && !markdown) {
      markdown = markdownLinkAt(text, markdownStart);
      if (!markdown) markdownStart = text.indexOf("[", markdownStart + 1);
    }
    const bare = bareLinkAt(text, cursor);
    const useMarkdown = markdown && (bare === null || markdownStart <= bare.start);
    if (useMarkdown && markdown) {
      appendText(segments, text.slice(cursor, markdownStart));
      segments.push({ kind: "link", href: markdown.href, label: markdown.label });
      cursor = markdown.end;
    } else if (bare) {
      appendText(segments, text.slice(cursor, bare.start));
      segments.push({ kind: "link", href: bare.href, label: bare.label });
      cursor = bare.end;
    } else {
      appendText(segments, text.slice(cursor));
      break;
    }
  }
  return segments;
}
