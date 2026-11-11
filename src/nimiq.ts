// Loads the Nimiq crypto code (WebAssembly) once, on first use. The light client
// itself is never started: chain reads go through the public RPC instead.
import type { Nimiq } from './chain';

let loading: Promise<Nimiq> | null = null;

export function loadNimiq(): Promise<Nimiq> {
  if (!loading) {
    loading = (async () => {
      const mod = await import('@nimiq/core/web');
      await mod.default();
      return mod as unknown as Nimiq;
    })().catch((e) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}
