import React, { useState } from "react";

/**
 * Inline tag editor — type-to-add chips. Used for seller blocklist/allowlist
 * and color allowlist. Press Enter, comma, or blur to commit a tag.
 */
export default function TagEditor({ tags = [], onChange, placeholder, tone = "primary", maxLength = 64, maxTags = 100 }) {
  const [draft, setDraft] = useState("");

  function commit() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed.length > maxLength) {
      setDraft("");
      return;
    }
    if (tags.some((tag) => tag.toLowerCase() === trimmed.toLowerCase())) {
      setDraft("");
      return;
    }
    if (tags.length >= maxTags) {
      setDraft("");
      return;
    }
    onChange([...tags, trimmed]);
    setDraft("");
  }

  function remove(tag) {
    onChange(tags.filter((t) => t !== tag));
  }

  function handleKey(event) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commit();
    } else if (event.key === "Backspace" && !draft && tags.length) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className="tag-editor border rounded p-2" style={{ minHeight: 44, background: "var(--bs-body-bg)" }}>
      <div className="d-flex flex-wrap align-items-center gap-2">
        {tags.map((tag) => (
          <span key={tag} className={`badge bg-${tone}-subtle text-${tone} rounded-4 px-2 py-1 fs-2 d-inline-flex align-items-center gap-1`}>
            {tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              className="btn btn-link p-0 ms-1 text-muted lh-1 d-inline-flex"
              aria-label={`Retirer ${tag}`}
              style={{ fontSize: 14 }}
            >
              <iconify-icon icon="solar:close-circle-line-duotone"></iconify-icon>
            </button>
          </span>
        ))}
        <input
          type="text"
          className="border-0 flex-grow-1"
          style={{ minWidth: 120, outline: "none", background: "transparent" }}
          value={draft}
          placeholder={tags.length === 0 ? placeholder : ""}
          maxLength={maxLength}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKey}
          onBlur={commit}
        />
      </div>
    </div>
  );
}
