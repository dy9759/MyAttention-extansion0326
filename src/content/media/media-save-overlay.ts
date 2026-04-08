const OVERLAY_STYLE_ID = 'sayso-media-save-overlay-style';

function ensureStyles(): void {
  if (document.getElementById(OVERLAY_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = OVERLAY_STYLE_ID;
  style.textContent = `
    .sayso-media-save-overlay {
      position: fixed;
      z-index: 2147483646;
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 999px;
      background: rgba(17, 24, 39, 0.92);
      color: #fff;
      display: none;
      align-items: center;
      justify-content: center;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
      cursor: pointer;
      padding: 0;
      transition: transform .12s ease, background .12s ease, opacity .12s ease;
    }
    .sayso-media-save-overlay:hover {
      background: rgba(31, 41, 55, 0.96);
      transform: scale(1.04);
    }
    .sayso-media-save-overlay[data-busy="true"] {
      cursor: wait;
      opacity: 0.72;
    }
    .sayso-media-save-overlay svg {
      width: 14px;
      height: 14px;
      display: block;
    }
  `;
  document.documentElement.appendChild(style);
}

function clampPosition(x: number, y: number): { x: number; y: number } {
  const maxX = Math.max(8, window.innerWidth - 36);
  const maxY = Math.max(8, window.innerHeight - 36);
  return {
    x: Math.max(8, Math.min(x, maxX)),
    y: Math.max(8, Math.min(y, maxY)),
  };
}

export class MediaSaveOverlay {
  private readonly element: HTMLButtonElement;

  private visible = false;

  constructor(onClick: () => void) {
    ensureStyles();
    this.element = document.createElement('button');
    this.element.type = 'button';
    this.element.className = 'sayso-media-save-overlay';
    this.element.setAttribute('data-sayso-media-overlay', 'true');
    this.element.setAttribute('aria-label', 'Save media to My Attention');
    this.element.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 4v10m0 0 4-4m-4 4-4-4M5 18h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    this.element.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.element.dataset.busy === 'true') {
        return;
      }
      onClick();
    });
    document.documentElement.appendChild(this.element);
  }

  isOverlayTarget(target: EventTarget | null): boolean {
    return target instanceof Node && this.element.contains(target);
  }

  showAt(x: number, y: number): void {
    const position = clampPosition(x, y);
    this.element.style.left = `${position.x}px`;
    this.element.style.top = `${position.y}px`;
    this.element.style.display = 'flex';
    this.visible = true;
  }

  hide(): void {
    this.element.style.display = 'none';
    this.visible = false;
    this.setBusy(false);
  }

  setBusy(isBusy: boolean): void {
    this.element.dataset.busy = isBusy ? 'true' : 'false';
    this.element.disabled = isBusy;
  }

  isVisible(): boolean {
    return this.visible;
  }

  destroy(): void {
    this.element.remove();
    this.visible = false;
  }
}
