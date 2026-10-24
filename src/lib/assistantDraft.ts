// A one-use handoff between the home composer and the private conversation.
// Never put a private question in a URL, localStorage, analytics or a server render.
let draft: { owner: string; text: string; expires: number } | null = null;

export function setAssistantDraft(owner: string, text: string) {
  if (typeof window === "undefined") return;
  draft = { owner, text: text.slice(0, 1000), expires: Date.now() + 60_000 };
}

export function takeAssistantDraft(owner: string): string | null {
  if (typeof window === "undefined") return null;
  const pending = draft;
  draft = null;
  return pending?.owner === owner && pending.expires > Date.now() ? pending.text : null;
}
