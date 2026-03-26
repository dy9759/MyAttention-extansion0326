function unionRanges(a: Range, b: Range): Range {
  const result = new Range();

  if (a.compareBoundaryPoints(Range.START_TO_START, b) <= 0) {
    result.setStart(a.startContainer, a.startOffset);
  } else {
    result.setStart(b.startContainer, b.startOffset);
  }

  if (a.compareBoundaryPoints(Range.END_TO_END, b) >= 0) {
    result.setEnd(a.endContainer, a.endOffset);
  } else {
    result.setEnd(b.endContainer, b.endOffset);
  }

  return result;
}

export function selectedRange(selection: Selection | null = document.getSelection()): Range | null {
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  let range = selection.getRangeAt(0);
  for (let index = 1; index < selection.rangeCount; index += 1) {
    range = unionRanges(range, selection.getRangeAt(index));
  }

  if (range.collapsed) {
    return null;
  }

  return range;
}
