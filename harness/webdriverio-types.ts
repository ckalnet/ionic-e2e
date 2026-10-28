// Type-only check, never run: a real WebdriverIO browser must satisfy the
// structural `DeviceBrowser` the Appium driver declares, so a WebdriverIO
// release that renames or drops a method fails `npm run typecheck`.
import type { Browser } from 'webdriverio';
import type { DeviceBrowser } from '../src/index.ts';

declare const browser: Browser;
export const device: DeviceBrowser = browser;
