"use client";

import { useRef, useState } from "react";
import { Bold, Italic, Link2, List, ListOrdered, Underline } from "lucide-react";

const COMMANDS: { icon: typeof Bold; command: string; label: string }[] = [
  { icon: Bold, command: "bold", label: "Krepko" },
  { icon: Italic, command: "italic", label: "Ležeče" },
  { icon: Underline, command: "underline", label: "Podčrtano" },
  { icon: List, command: "insertUnorderedList", label: "Seznam" },
  { icon: ListOrdered, command: "insertOrderedList", label: "Oštevilčen seznam" },
];

export default function RichTextEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Captured once on mount — the editable div is uncontrolled after that, so
  // re-renders triggered by our own onChange (parent state updating on every
  // keystroke) don't reset the DOM and steal the cursor position.
  const [initialValue] = useState(value);

  function exec(command: string) {
    ref.current?.focus();
    document.execCommand(command);
    if (ref.current) onChange(ref.current.innerHTML);
  }

  function addLink() {
    const url = window.prompt("URL povezave:");
    if (!url) return;
    exec("createLink");
    document.execCommand("createLink", false, url);
    if (ref.current) onChange(ref.current.innerHTML);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200">
      <div className="flex items-center gap-1 border-b border-zinc-200 bg-zinc-50 px-2 py-1.5">
        {COMMANDS.map((c) => (
          <button
            key={c.command}
            type="button"
            title={c.label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec(c.command)}
            className="rounded-md p-1.5 text-zinc-500 hover:bg-white hover:text-zinc-900"
          >
            <c.icon className="h-3.5 w-3.5" />
          </button>
        ))}
        <button
          type="button"
          title="Povezava"
          onMouseDown={(e) => e.preventDefault()}
          onClick={addLink}
          className="rounded-md p-1.5 text-zinc-500 hover:bg-white hover:text-zinc-900"
        >
          <Link2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        dangerouslySetInnerHTML={{ __html: initialValue }}
        className="min-h-[160px] px-3 py-2.5 text-sm text-zinc-800 focus:outline-none [&_a]:text-accent [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
      />
    </div>
  );
}
