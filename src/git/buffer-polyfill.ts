import { Buffer } from 'buffer';

// isomorphic-git expects a Node-style global Buffer.
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer ??= Buffer;
