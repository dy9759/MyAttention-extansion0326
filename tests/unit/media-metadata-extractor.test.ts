import { describe, expect, it } from 'vitest';

import { extractMediaMetadata } from '@/content/media/media-metadata-extractor';

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

describe('media-metadata-extractor', () => {
  it('extracts image caption, alt text, and dimensions', () => {
    document.body.innerHTML = `
      <figure>
        <img id="target" src="https://example.com/hero.png" alt="hero image">
        <figcaption>Hero figure caption</figcaption>
      </figure>
    `;

    const image = document.getElementById('target') as HTMLImageElement;
    mockRect(image, 320, 180);
    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1280 });
    Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 720 });

    const metadata = extractMediaMetadata(image);

    expect(metadata).not.toBeNull();
    expect(metadata?.media.kind).toBe('image');
    expect(metadata?.media.sourceUrl).toBe('https://example.com/hero.png');
    expect(metadata?.media.altText).toBe('hero image');
    expect(metadata?.media.width).toBe(1280);
    expect(metadata?.media.height).toBe(720);
    expect(metadata?.summaryText).toBe('Hero figure caption');
    expect(metadata?.contextText).toContain('Hero figure caption');
  });

  it('extracts video poster, duration, and mime type', () => {
    document.body.innerHTML = `
      <figure>
        <video id="target" src="https://example.com/demo.mp4" poster="https://example.com/poster.jpg" title="Demo video"></video>
      </figure>
    `;

    const video = document.getElementById('target') as HTMLVideoElement;
    mockRect(video, 640, 360);
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1920 });
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1080 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 42.5 });

    const metadata = extractMediaMetadata(video);

    expect(metadata).not.toBeNull();
    expect(metadata?.media.kind).toBe('video');
    expect(metadata?.media.posterUrl).toBe('https://example.com/poster.jpg');
    expect(metadata?.media.durationSec).toBe(42.5);
    expect(metadata?.media.mimeType).toBe('video/mp4');
    expect(metadata?.summaryText).toBe('Demo video');
  });
});
