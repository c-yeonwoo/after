/** Reading layout only. Stored/model text is never rewritten or truncated. */
export function managerParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/u).flatMap((block) => {
    if (block.length <= 110 || block.includes("\n") || typeof Intl.Segmenter !== "function")
      return block.trim() ? [block] : [];
    const paragraphs: string[] = [];
    let current = "";
    for (const { segment } of new Intl.Segmenter("ko", { granularity: "sentence" }).segment(
      block,
    )) {
      if (current && current.length + segment.length > 110) {
        paragraphs.push(current);
        current = "";
      }
      current += segment;
    }
    if (current) paragraphs.push(current);
    return paragraphs;
  });
}
