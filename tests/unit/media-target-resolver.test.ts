import { describe, expect, it } from 'vitest';

import {
  getMediaElementFromNode,
  isSaveableMediaElement,
} from '@/content/media/media-target-resolver';

function mockRect(element: Element, width: number, height: number): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () =>
      ({
        width,
        height,
        top: 0,
        left: 0,
        right: width,
        bottom: height,
      }) as DOMRect,
  });
}

describe('media-target-resolver', () => {
  it('resolves nested nodes to their image element and accepts large media', () => {
    document.body.innerHTML = `
      <figure>
        <img id="target" src="https://example.com/cat.png" alt="cat">
      </figure>
    `;

    const image = document.getElementById('target') as HTMLImageElement;
    mockRect(image, 120, 96);

    expect(getMediaElementFromNode(image)).toBe(image);
    expect(isSaveableMediaElement(image)).toBe(true);
  });

  it('rejects tiny decorative images', () => {
    document.body.innerHTML = `<img id="tiny" src="https://example.com/icon.png" alt="icon">`;

    const image = document.getElementById('tiny') as HTMLImageElement;
    mockRect(image, 24, 24);

    expect(isSaveableMediaElement(image)).toBe(false);
  });

  it('accepts audio controls when width threshold is met', () => {
    document.body.innerHTML = `<audio id="audio" controls src="https://example.com/test.mp3"></audio>`;

    const audio = document.getElementById('audio') as HTMLAudioElement;
    mockRect(audio, 220, 36);

    expect(isSaveableMediaElement(audio)).toBe(true);
  });
});
