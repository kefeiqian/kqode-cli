import '@/devGlobals.ts';
import { runKqodeCli } from '@/cli/kqodeCli.tsx';

await runKqodeCli({ entryUrl: import.meta.url });
