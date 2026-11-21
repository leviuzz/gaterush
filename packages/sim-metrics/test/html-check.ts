/** Every opened tag is closed in order (void elements and self-closing SVG tags excepted). */
export function balancedTags(html: string): boolean {
  const voids = new Set(['meta', 'br', 'img', 'input', 'link', 'hr']);
  const stack: string[] = [];
  for (const match of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*?)(\/?)>/g)) {
    const [, closing, name = '', , selfClosing] = match;
    const tag = name.toLowerCase();
    if (voids.has(tag) || selfClosing === '/') continue;
    if (closing === '/') {
      if (stack.pop() !== tag) return false;
    } else {
      stack.push(tag);
    }
  }
  return stack.length === 0;
}
