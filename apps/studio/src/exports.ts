/** True in the offline page, which saves files itself; false in the claude.ai page (build-time). */
declare const __STUDIO_DIRECT_DOWNLOADS__: boolean;

/** The viewer's `downloads` capability of a claude.ai page (runtime contract 0.2.98). */
interface HostDownloads {
  save(request: { filename: string; data: string | Blob }): Promise<{ status: string }>;
}

let hostDownloads: Promise<HostDownloads | null> | undefined;

/** The `downloads` capability when the page runs in a claude.ai viewer that grants it, else null. */
export function viewerDownloads(): Promise<HostDownloads | null> {
  const claude = (window as unknown as { claude?: { use?: (name: string) => Promise<unknown> } })
    .claude;
  if (typeof claude?.use !== 'function') return Promise.resolve(null);
  hostDownloads ??= claude.use('downloads').then(
    (namespace) => (namespace ?? null) as HostDownloads | null,
    () => null,
  );
  return hostDownloads;
}

/** Whether this page can save files: itself (offline page) or through the viewer. */
export async function canSaveFiles(): Promise<boolean> {
  return __STUDIO_DIRECT_DOWNLOADS__ || (await viewerDownloads()) !== null;
}

export type SaveOutcome = 'saved' | 'declined' | 'unavailable';

/** Saves a text file: through the viewer, which asks the person to confirm, or by the page itself. */
export async function saveFile(name: string, text: string, type: string): Promise<SaveOutcome> {
  const viewer = await viewerDownloads();
  if (viewer !== null) {
    try {
      await viewer.save({ filename: name, data: new Blob([text], { type }) });
      return 'saved';
    } catch (error) {
      return (error as { code?: unknown } | null)?.code === 'declined' ? 'declined' : 'unavailable';
    }
  }
  if (__STUDIO_DIRECT_DOWNLOADS__) {
    download(name, text, type);
    return 'saved';
  }
  return 'unavailable';
}

/** Saves a text file through the browser (offline page only). */
function download(name: string, text: string, type: string): void {
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
