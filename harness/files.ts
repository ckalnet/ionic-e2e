import { readFileSync } from 'node:fs';
import path from 'node:path';

export type IonicMode = 'md' | 'ios';
export type IonicVersion = 8 | 9;

const harnessDir = import.meta.dirname;
const nodeModules = path.join(harnessDir, '..', 'node_modules');

/** Where each Ionic version under test is installed (see devDependencies). */
const ionicCoreDirs: Record<IonicVersion, string> = {
	8: path.join(nodeModules, '@ionic', 'core-8'),
	9: path.join(nodeModules, '@ionic', 'core'),
};

/** The harness page, with the Ionic mode filled in. */
export function indexHtml(mode: IonicMode): string {
	return readFileSync(path.join(harnessDir, 'index.html'), 'utf8').replace("mode: 'md'", `mode: '${mode}'`);
}

/** Map a harness URL path onto a file on disk ('/' is `indexHtml`). */
export function fileFor(pathname: string, version: IonicVersion): string {
	const ionicCore = ionicCoreDirs[version];
	if (pathname.startsWith('/ionic/')) return path.join(ionicCore, 'dist', 'ionic', pathname.slice('/ionic/'.length));
	if (pathname.startsWith('/ionic-css/')) return path.join(ionicCore, 'css', pathname.slice('/ionic-css/'.length));
	return path.join(harnessDir, pathname);
}
