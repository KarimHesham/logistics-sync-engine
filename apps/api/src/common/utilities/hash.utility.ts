import { createHash } from 'node:crypto';
import stringify from 'fast-json-stable-stringify';

export class HashUtility {
  static computeStableHash(payload: unknown): string {
    const stableString = stringify(payload);
    return createHash('sha256').update(stableString).digest('hex');
  }

  static computeDedupeKey(parts: unknown[]): string {
    const raw = parts
      .map((p) => {
        if (typeof p === 'object' && p !== null) {
          return stringify(p);
        }
        return String(p);
      })
      .join('|');
    return createHash('sha256').update(raw).digest('hex');
  }
}
