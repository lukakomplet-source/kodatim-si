import { Fragment, type ReactNode } from "react";

/**
 * Renders the small Markdown subset the AI coaches are told to write —
 * **bold**, ### headings, numbered steps, bullets — without pulling in a
 * markdown library for four constructs.
 *
 * Before this, answers arrived as one wall of text with "1. ... 2. ..." run
 * together mid-line, which is unreadable exactly where readability is the
 * point: a plan you are meant to follow step by step.
 */

function bold(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? (
      <strong key={`${keyPrefix}-${i}`} className="font-semibold text-zinc-900">
        {part}
      </strong>
    ) : (
      <Fragment key={`${keyPrefix}-${i}`}>{part}</Fragment>
    )
  );
}

type Block =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "numbered"; items: string[] };

function parse(text: string): Block[] {
  const blocks: Block[] = [];
  // Models often cram "1. Prvi korak. 2. Drugi korak." into one line — split
  // those apart first, or the list detection below never sees them.
  const lines = text
    .replace(/(\S[.!?])\s+(?=\d{1,2}\.\s+\p{Lu})/gu, "$1\n")
    .split(/\r?\n/);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const heading = line.match(/^#{1,4}\s+(.*)$/);
    const bullet = line.match(/^[-•*]\s+(.*)$/);
    const numbered = line.match(/^\d{1,2}[.)]\s+(.*)$/);
    const last = blocks[blocks.length - 1];

    if (heading) {
      blocks.push({ type: "heading", text: heading[1] });
    } else if (bullet) {
      if (last?.type === "bullets") last.items.push(bullet[1]);
      else blocks.push({ type: "bullets", items: [bullet[1]] });
    } else if (numbered) {
      if (last?.type === "numbered") last.items.push(numbered[1]);
      else blocks.push({ type: "numbered", items: [numbered[1]] });
    } else {
      blocks.push({ type: "paragraph", text: line });
    }
  }
  return blocks;
}

export default function FormattedText({ text }: { text: string }) {
  const blocks = parse(text);
  return (
    <div className="space-y-1.5">
      {blocks.map((block, i) => {
        if (block.type === "heading") {
          return (
            <p key={i} className="pt-0.5 font-semibold text-zinc-900">
              {bold(block.text, `h${i}`)}
            </p>
          );
        }
        if (block.type === "bullets") {
          return (
            <ul key={i} className="list-disc space-y-0.5 pl-4">
              {block.items.map((item, j) => (
                <li key={j}>{bold(item, `b${i}-${j}`)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === "numbered") {
          return (
            <ol key={i} className="list-decimal space-y-0.5 pl-4">
              {block.items.map((item, j) => (
                <li key={j}>{bold(item, `n${i}-${j}`)}</li>
              ))}
            </ol>
          );
        }
        return <p key={i}>{bold(block.text, `p${i}`)}</p>;
      })}
    </div>
  );
}
