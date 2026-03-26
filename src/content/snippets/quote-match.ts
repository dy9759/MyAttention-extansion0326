export interface QuoteMatchContext {
  prefix?: string;
  suffix?: string;
  hint?: number;
}

export interface QuoteMatchResult {
  start: number;
  end: number;
  score: number;
}

function similarityScore(text: string, target: string): number {
  if (!text || !target) {
    return 0;
  }

  if (text === target) {
    return 1;
  }

  const shorter = text.length <= target.length ? text : target;
  const longer = text.length > target.length ? text : target;
  let shared = 0;

  for (let index = 0; index < shorter.length; index += 1) {
    if (shorter[index] === longer[index]) {
      shared += 1;
    }
  }

  return shared / longer.length;
}

export function matchQuote(
  text: string,
  quote: string,
  context: QuoteMatchContext = {}
): QuoteMatchResult | null {
  if (!text || !quote) {
    return null;
  }

  const exactStart = text.indexOf(quote);
  if (exactStart !== -1) {
    return {
      start: exactStart,
      end: exactStart + quote.length,
      score: 1,
    };
  }

  const candidates: QuoteMatchResult[] = [];
  const windowLength = quote.length;

  for (let index = 0; index <= text.length - windowLength; index += 1) {
    const windowText = text.slice(index, index + windowLength);
    const quoteScore = similarityScore(windowText, quote);
    const prefixScore = context.prefix
      ? similarityScore(text.slice(Math.max(0, index - context.prefix.length), index), context.prefix)
      : 1;
    const suffixScore = context.suffix
      ? similarityScore(
          text.slice(index + windowLength, index + windowLength + context.suffix.length),
          context.suffix
        )
      : 1;
    const hintScore =
      typeof context.hint === 'number'
        ? 1 - Math.min(1, Math.abs(index - context.hint) / Math.max(1, text.length))
        : 1;
    const score = quoteScore * 0.6 + prefixScore * 0.15 + suffixScore * 0.15 + hintScore * 0.1;

    if (score >= 0.55) {
      candidates.push({
        start: index,
        end: index + windowLength,
        score,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}
