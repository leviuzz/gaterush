/** Saves a text file through the browser (offline page only; the claude.ai frame blocks it). */
export function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

/** Copies text; resolves to false when the browser refuses (the caller then shows the text). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Reads files chosen by the person, as text. */
export async function readFiles(files: FileList): Promise<{ name: string; text: string }[]> {
  return Promise.all(
    [...files].map(async (file) => ({ name: file.name, text: await file.text() })),
  );
}
