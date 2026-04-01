/**
 * ExpressionInput — autocomplete-enabled input for workflow template expressions.
 *
 * Features:
 * - Typing `{{` opens a dropdown of available upstream node outputs
 * - Dropdown is filterable by typing after `{{`
 * - Selected tokens insert as `{{expression}}` into the text
 * - Manual `{{anything}}` typing still works (autocomplete is enhancement, not gate)
 * - Function hints when typing known function names
 * - Works as both single-line (text) and multi-line (textarea) input
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { ExpressionToken } from "@/lib/workflow-schema";

// ── Built-in expression functions for hints ─────────────────────

const EXPRESSION_FUNCTIONS = [
  { name: "uppercase", signature: "uppercase(text)", description: "Convert to uppercase" },
  { name: "lowercase", signature: "lowercase(text)", description: "Convert to lowercase" },
  { name: "trim", signature: "trim(text)", description: "Remove leading/trailing whitespace" },
  {
    name: "replace",
    signature: "replace(text, search, replacement)",
    description: "Replace occurrences",
  },
  {
    name: "substring",
    signature: "substring(text, start, end?)",
    description: "Extract substring",
  },
  { name: "length", signature: "length(text)", description: "String or array length" },
  { name: "split", signature: "split(text, delimiter)", description: "Split string into array" },
  { name: "join", signature: "join(array, delimiter)", description: "Join array into string" },
  { name: "first", signature: "first(array)", description: "First element of array" },
  { name: "last", signature: "last(array)", description: "Last element of array" },
  { name: "contains", signature: "contains(text, search)", description: "Check if contains" },
  { name: "count", signature: "count(array)", description: "Count elements" },
  { name: "if", signature: "if(condition, ifTrue, ifFalse)", description: "Conditional value" },
  { name: "isEmpty", signature: "isEmpty(value)", description: "Check if empty/null" },
  { name: "isNotEmpty", signature: "isNotEmpty(value)", description: "Check if not empty" },
  { name: "coalesce", signature: "coalesce(a, b)", description: "First non-null value" },
  { name: "toNumber", signature: "toNumber(value)", description: "Convert to number" },
  { name: "toString", signature: "toString(value)", description: "Convert to string" },
  { name: "now", signature: "now()", description: "Current timestamp (ms)" },
  { name: "formatDate", signature: "formatDate(timestamp, format?)", description: "Format a date" },
  { name: "round", signature: "round(number, decimals?)", description: "Round number" },
  { name: "min", signature: "min(a, b)", description: "Minimum value" },
  { name: "max", signature: "max(a, b)", description: "Maximum value" },
  { name: "abs", signature: "abs(number)", description: "Absolute value" },
  { name: "parseJSON", signature: "parseJSON(text)", description: "Parse JSON string" },
];

// ── Type colors for token badges ────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  string: "text-green-400",
  number: "text-blue-400",
  boolean: "text-purple-400",
  object: "text-yellow-400",
  array: "text-teal-400",
};

// ── Component ───────────────────────────────────────────────────

type ExpressionInputProps = {
  value: string;
  onChange: (value: string) => void;
  tokens: ExpressionToken[];
  placeholder?: string;
  multiline?: boolean;
  className?: string;
};

export function ExpressionInput({
  value,
  onChange,
  tokens,
  placeholder,
  multiline = false,
  className,
}: ExpressionInputProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [filter, setFilter] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Combined suggestions: tokens + functions
  const suggestions = useMemo(() => {
    const lowerFilter = filter.toLowerCase();
    const items: Array<{
      kind: "token" | "function";
      label: string;
      detail: string;
      type: string;
      insertText: string;
    }> = [];

    // Token suggestions
    for (const token of tokens) {
      if (
        lowerFilter &&
        !token.expression.toLowerCase().includes(lowerFilter) &&
        !token.label.toLowerCase().includes(lowerFilter) &&
        !token.nodeLabel.toLowerCase().includes(lowerFilter)
      ) {
        continue;
      }
      items.push({
        kind: "token",
        label: token.label,
        detail: token.nodeLabel,
        type: token.type,
        insertText: token.expression,
      });
    }

    // Function suggestions (only when filter looks like a function start)
    if (!lowerFilter || /^[a-z]/.test(lowerFilter)) {
      for (const fn of EXPRESSION_FUNCTIONS) {
        if (lowerFilter && !fn.name.toLowerCase().startsWith(lowerFilter)) {
          continue;
        }
        items.push({
          kind: "function",
          label: fn.signature,
          detail: fn.description,
          type: "fn",
          insertText: fn.name + "(",
        });
      }
    }

    return items.slice(0, 20); // Cap at 20 suggestions
  }, [tokens, filter]);

  // Detect `{{` trigger
  const handleInput = useCallback(
    (newValue: string, selectionStart: number) => {
      onChange(newValue);
      setCursorPosition(selectionStart);

      // Check if we're inside a {{ }} block
      const before = newValue.slice(0, selectionStart);
      const openIdx = before.lastIndexOf("{{");
      const closeIdx = before.lastIndexOf("}}");

      if (openIdx >= 0 && openIdx > closeIdx) {
        // We're inside an open {{ ... expression
        const partial = before.slice(openIdx + 2);
        setFilter(partial.trim());
        setShowDropdown(true);
        setSelectedIndex(0);
      } else {
        setShowDropdown(false);
        setFilter("");
      }
    },
    [onChange],
  );

  // Insert selected suggestion
  const insertSuggestion = useCallback(
    (insertText: string) => {
      const before = value.slice(0, cursorPosition);
      const after = value.slice(cursorPosition);

      const openIdx = before.lastIndexOf("{{");
      if (openIdx < 0) {
        return;
      }

      const prefix = before.slice(0, openIdx);
      // Find if there's already a closing }}
      const closeIdx = after.indexOf("}}");
      const suffix = closeIdx >= 0 ? after.slice(closeIdx + 2) : after;

      const newValue = `${prefix}{{${insertText}}}${suffix}`;
      onChange(newValue);
      setShowDropdown(false);
      setFilter("");

      // Restore focus
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) {
          el.focus();
          const pos = prefix.length + insertText.length + 4; // {{...}}
          el.setSelectionRange(pos, pos);
        }
      });
    },
    [value, cursorPosition, onChange],
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!showDropdown || suggestions.length === 0) {
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, suggestions.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (suggestions[selectedIndex]) {
          e.preventDefault();
          insertSuggestion(suggestions[selectedIndex].insertText);
        }
      } else if (e.key === "Escape") {
        setShowDropdown(false);
      }
    },
    [showDropdown, suggestions, selectedIndex, insertSuggestion],
  );

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    if (!dropdownRef.current) {
      return;
    }
    const selected = dropdownRef.current.querySelector("[data-selected=true]");
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const baseClasses =
    "w-full mt-1 px-2 py-1.5 text-xs rounded-md bg-[var(--glass-bg)] border border-[var(--glass-border)] text-neutral-300 placeholder:text-neutral-700 focus:outline-none focus:ring-1 focus:ring-orange-500/50";

  return (
    <div className="relative">
      {multiline ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={value}
          onChange={(e) => handleInput(e.target.value, e.target.selectionStart ?? 0)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={3}
          className={`${baseClasses} resize-none ${className ?? ""}`}
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          value={value}
          onChange={(e) => handleInput(e.target.value, e.target.selectionStart ?? 0)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`${baseClasses} h-7 ${className ?? ""}`}
        />
      )}

      {/* Hint text */}
      {!showDropdown && !value && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-neutral-700 pointer-events-none">
          {"{{ for data"}
        </span>
      )}

      {/* Autocomplete dropdown */}
      {showDropdown && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 left-0 right-0 mt-1 max-h-[200px] overflow-y-auto rounded-md border border-[var(--glass-chrome-border)] bg-[var(--glass-sidebar)] shadow-xl"
        >
          {suggestions.map((item, i) => (
            <button
              key={`${item.kind}-${item.insertText}`}
              data-selected={i === selectedIndex}
              onClick={() => insertSuggestion(item.insertText)}
              className={`w-full text-left px-2 py-1.5 text-xs flex items-center gap-2 cursor-pointer transition-colors ${
                i === selectedIndex
                  ? "bg-orange-500/20 text-orange-300"
                  : "text-neutral-400 hover:bg-[var(--glass-subtle-hover)]"
              }`}
            >
              {/* Type badge */}
              <span
                className={`text-[9px] font-mono shrink-0 w-5 text-center ${
                  item.kind === "function"
                    ? "text-amber-400"
                    : (TYPE_COLORS[item.type] ?? "text-neutral-500")
                }`}
              >
                {item.kind === "function" ? "fn" : item.type.slice(0, 3)}
              </span>

              {/* Label and detail */}
              <span className="truncate flex-1 font-mono">{item.label}</span>
              <span className="text-[9px] text-neutral-600 truncate max-w-[80px]">
                {item.detail}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
