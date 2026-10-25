# After AI concierge characters

User-approved detailed character illustrations (2026-10-25).

- `female.webp`: displayed for male members.
- `male.webp`: displayed for female members.
- Both are 512 × 512 transparent WebP delivery versions of the approved generated PNGs. Only resizing/encoding was applied. Their facial features, drawing style and wardrobe have not been reinterpreted by UI tooling.
- Use the shared `AssistantMark` beside an AI utterance (40px default, 56px welcome exception). Label the speaker as After AI. Never use these assets as a member profile or the subject of an appointment card.
- Both characters share the same assistant behavior and permissions. No AI capability is enabled by selecting an avatar.
- Import through `AssistantMark`, never reconstruct a public URL. The build emits content-hashed `/assets/` URLs with the existing one-year immutable cache policy. Updating the image changes its URL; repeated utterances and route changes reuse the same browser resource. Prompt records stay in source, not in the public asset directory.

The female illustration was generated from the portrait supplied by the user in this conversation. The male illustration used that approved drawing as its style reference. Both were produced with the built-in image generation tool. The original reference photograph is not shipped.

Exact generation prompts are preserved in the adjacent `female.prompt.txt` and `male.prompt.txt` files. Earlier flat-character and photographic concepts are superseded.
