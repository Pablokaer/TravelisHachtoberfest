// When the network fails, the copy saved on the device answers (D-092).

/**
 * The network answer; when it fails, the saved copy (if there is one and it can be read). With no
 * copy the original network error is the error, so a screen still says what went wrong.
 * @example await withOfflineFallback(() => fetchTrip(id), () => library.get(id))
 */
export async function withOfflineFallback<T>(
  online: () => Promise<T>,
  fromDevice: () => Promise<T | null>,
): Promise<T> {
  try {
    return await online();
  } catch (networkError) {
    const saved = await fromDevice().catch((error: unknown) => {
      // Not fatal (the network error below is what the screen shows), but never silent.
      console.warn('[offline] the saved copy could not be read:', error);
      return null;
    });
    if (saved === null) throw networkError;
    return saved;
  }
}
