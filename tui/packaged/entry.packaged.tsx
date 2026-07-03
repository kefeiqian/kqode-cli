import { runKqodeCli } from '@/cli/kqodeCli.tsx';
import { loadEmbeddedBackendAsset } from './embeddedBackendAsset.ts';

// Packaged (`bun build --compile`) entrypoint. Mirrors `main.tsx` but injects
// the embedded backend asset so the Bun-only embedding stays out of the source
// graph. `--define KQODE_ENV="prod"` selects the packaged branch.
await runKqodeCli({ entryUrl: import.meta.url, loadPackagedAsset: loadEmbeddedBackendAsset });
