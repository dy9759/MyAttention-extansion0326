/// <reference types="vite/client" />

declare function importScripts(...urls: string[]): void;

interface Element {
  innerText: string;
}

interface Window {
  saySoSettings?: Record<string, any>;
}
