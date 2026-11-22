import qrcode from 'qrcode-generator';

/** The quiet zone around a QR code, in modules, as the standard asks. */
const QUIET = 4;

/**
 * The dark modules of the QR code of `text`, as one SVG path, and the size of the code with its
 * quiet zone. Error correction M survives a crease or a dirty screen.
 */
export function qrPath(text: string): { readonly size: number; readonly path: string } {
  const code = qrcode(0, 'M');
  code.addData(text);
  code.make();
  const count = code.getModuleCount();
  const parts: string[] = [];
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (code.isDark(row, col)) {
        parts.push(`M${String(col + QUIET)} ${String(row + QUIET)}h1v1h-1z`);
      }
    }
  }
  return { size: count + 2 * QUIET, path: parts.join('') };
}
