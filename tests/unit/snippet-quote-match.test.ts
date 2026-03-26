import { describe, expect, it } from 'vitest';

import { matchQuote } from '@/content/snippets/quote-match';

describe('matchQuote', () => {
  it('returns exact matches immediately', () => {
    expect(matchQuote('alpha beta gamma', 'beta')).toMatchObject({
      start: 6,
      end: 10,
      score: 1,
    });
  });

  it('uses prefix, suffix, and hint to rank fuzzy candidates', () => {
    const result = matchQuote('alpha betx gamma alpha beta gamma', 'beta', {
      prefix: 'alpha ',
      suffix: ' gamma',
      hint: 20,
    });

    expect(result).toMatchObject({
      start: 23,
      end: 27,
    });
    expect((result?.score || 0) > 0.55).toBe(true);
  });
});
