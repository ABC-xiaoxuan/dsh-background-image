// Only acknowledge the submitted values; newer edits must survive older saves.
export function acknowledgeDraft(draft, patch) {
  const next = { ...draft };
  for (const [key, value] of Object.entries(patch)) if (next[key] === value) delete next[key];
  return next;
}
