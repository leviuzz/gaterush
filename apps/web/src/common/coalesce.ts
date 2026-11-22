/**
 * A refresh that never runs twice at once (S18): asked again while it runs, it runs once more
 * after, however many times it was asked. A checkpoint of the digital twin changes many times a
 * second; a screen asks the server one question at a time.
 */
export function coalesced(run: () => Promise<void>): () => Promise<void> {
  let running: Promise<void> | null = null;
  let again = false;
  const go = async (): Promise<void> => {
    if (running !== null) {
      again = true;
      return running;
    }
    running = (async () => {
      try {
        await run();
      } finally {
        running = null;
      }
    })();
    await running;
    if (again) {
      again = false;
      await go();
    }
  };
  return go;
}
