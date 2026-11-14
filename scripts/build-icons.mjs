#!/usr/bin/env node
/**
 * @file scripts/build-icons.mjs
 * @version 1.3.0
 * Generates Web (public/favicon.svg), Android (mipmap-*), and Tauri Desktop (src-tauri/icons/*)
 * icons from the single source of truth: shr-logo.svg.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const __version__ = '1.3.0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const CANDIDATE_LOGO_PATHS = [
    path.join(ROOT_DIR, 'src', 'assets', 'shr-logo.svg'),
    path.join(ROOT_DIR, 'shr-logo.svg'),
    path.join(ROOT_DIR, 'public', 'shr-logo.svg'),
];

const MIPMAP_TARGETS = [
    { folder: 'mipmap-mdpi', legacySize: 48, adaptiveSize: 108 },
    { folder: 'mipmap-hdpi', legacySize: 72, adaptiveSize: 162 },
    { folder: 'mipmap-xhdpi', legacySize: 96, adaptiveSize: 216 },
    { folder: 'mipmap-xxhdpi', legacySize: 144, adaptiveSize: 324 },
    { folder: 'mipmap-xxxhdpi', legacySize: 192, adaptiveSize: 432 },
];

function findSourceSvg() {
    const argPath = process.argv[2];
    if (argPath) {
        const resolved = path.resolve(ROOT_DIR, argPath);
        if (fs.existsSync(resolved)) return resolved;
    }
    for (const p of CANDIDATE_LOGO_PATHS) {
        if (fs.existsSync(p)) return p;
    }
    throw new Error(
        `Could not find 'shr-logo.svg'. Place it in src/assets/shr-logo.svg or repo root.`
    );
}

function buildPaddedSvg(rawSvg, { scaleRatio = 0.72, circleClip = false } = {}) {
    const viewBoxMatch = rawSvg.match(
        /viewBox=["']\s*([-\d.]+)\s+([-\d.]+)\s+([\d.]+)\s+([\d.]+)\s*["']/i
    );
    const widthMatch = rawSvg.match(/\bwidth=["']([\d.]+)/i);
    const heightMatch = rawSvg.match(/\bheight=["']([\d.]+)/i);

    const minX = viewBoxMatch ? parseFloat(viewBoxMatch[1]) : 0;
    const minY = viewBoxMatch ? parseFloat(viewBoxMatch[2]) : 0;
    const vbW = viewBoxMatch
        ? parseFloat(viewBoxMatch[3])
        : widthMatch
          ? parseFloat(widthMatch[1])
          : 512;
    const vbH = viewBoxMatch
        ? parseFloat(viewBoxMatch[4])
        : heightMatch
          ? parseFloat(heightMatch[1])
          : 512;

    let inner = rawSvg
        .replace(/<\?xml[^>]*\?>/gi, '')
        .replace(/<!DOCTYPE[^>]*>/gi, '')
        .replace(/^[\s\S]*?<svg[^>]*>/i, '')
        .replace(/<\/svg>[\s\S]*$/i, '')
        .replace(/<sodipodi:[^>]*\/>/gi, '')
        .replace(/<sodipodi:[\s\S]*?<\/sodipodi:[^>]+>/gi, '')
        .replace(/<inkscape:[^>]*\/>/gi, '')
        .replace(/<inkscape:[\s\S]*?<\/inkscape:[^>]+>/gi, '')
        .replace(/<metadata[\s\S]*?<\/metadata>/gi, '')
        .replace(/\s+(?:sodipodi|inkscape):[a-zA-Z0-9_-]+="[^"]*"/gi, '');

    const offsetX = (vbW * (1 - scaleRatio)) / 2 - minX * scaleRatio;
    const offsetY = (vbH * (1 - scaleRatio)) / 2 - minY * scaleRatio;

    const clipDef = circleClip
        ? `<defs><clipPath id="roundClip"><circle cx="${vbW / 2}" cy="${vbH / 2}" r="${Math.min(vbW, vbH) / 2}" /></clipPath></defs>`
        : '';
    const clipAttr = circleClip ? ' clip-path="url(#roundClip)"' : '';

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${vbW} ${vbH}" width="${vbW}" height="${vbH}">
  ${clipDef}
  <g${clipAttr}>
    <rect x="0" y="0" width="${vbW}" height="${vbH}" fill="#000000" />
    <g transform="translate(${offsetX.toFixed(3)}, ${offsetY.toFixed(3)}) scale(${scaleRatio})" fill="#ffffff">
      ${inner}
    </g>
  </g>
</svg>`;
}

function hasCommand(cmd) {
    const res = spawnSync(cmd, ['--version'], { stdio: 'ignore' });
    return !res.error && res.status === 0;
}

async function renderSvgToPng(svgString, outPngPath, sizePx) {
    fs.mkdirSync(path.dirname(outPngPath), { recursive: true });
    const tmpSvg = path.join(os.tmpdir(), `shr-icon-${process.pid}.svg`);
    fs.writeFileSync(tmpSvg, svgString, 'utf8');

    try {
        if (hasCommand('rsvg-convert')) {
            const res = spawnSync(
                'rsvg-convert',
                ['-w', String(sizePx), '-h', String(sizePx), tmpSvg, '-o', outPngPath],
                { stdio: 'inherit' }
            );
            if (res.status === 0) return;
        }
        if (hasCommand('inkscape')) {
            const res = spawnSync(
                'inkscape',
                [
                    tmpSvg,
                    `--export-width=${sizePx}`,
                    `--export-height=${sizePx}`,
                    `--export-filename=${outPngPath}`,
                ],
                { stdio: 'ignore' }
            );
            if (res.status === 0) return;
        }
        for (const magickCmd of ['magick', 'convert']) {
            if (hasCommand(magickCmd)) {
                const res = spawnSync(
                    magickCmd,
                    [
                        '-background',
                        'none',
                        '-resize',
                        `${sizePx}x${sizePx}`,
                        tmpSvg,
                        outPngPath,
                    ],
                    { stdio: 'inherit' }
                );
                if (res.status === 0) return;
            }
        }
        throw new Error(
            `No SVG->PNG rasterizer succeeded. Ensure librsvg2-bin (rsvg-convert) is installed.`
        );
    } finally {
        if (fs.existsSync(tmpSvg)) {
            fs.unlinkSync(tmpSvg);
        }
    }
}

async function main() {
    const srcSvgPath = findSourceSvg();
    console.log(`🎨 Using source logo: ${srcSvgPath}`);
    const rawSvg = fs.readFileSync(srcSvgPath, 'utf8');

    // 1. Write web favicon.svg (92% scale on solid black badge)
    const webFaviconSvg = buildPaddedSvg(rawSvg, {
        scaleRatio: 0.92,
        circleClip: false,
    });
    const publicFaviconPath = path.join(ROOT_DIR, 'public', 'favicon.svg');
    fs.writeFileSync(publicFaviconPath, webFaviconSvg, 'utf8');
    console.log(`✅ Updated web favicon: public/favicon.svg`);

    // 2. Prepare Android SVG variants
    const legacySquareSvg = buildPaddedSvg(rawSvg, {
        scaleRatio: 0.86,
        circleClip: false,
    });
    const legacyRoundSvg = buildPaddedSvg(rawSvg, {
        scaleRatio: 0.82,
        circleClip: true,
    });
    const adaptiveForegroundSvg = buildPaddedSvg(rawSvg, {
        scaleRatio: 0.64,
        circleClip: false,
    });

    const androidResDir = path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'res');
    if (fs.existsSync(androidResDir)) {
        const bgXmlPath = path.join(androidResDir, 'values', 'ic_launcher_background.xml');
        fs.mkdirSync(path.dirname(bgXmlPath), { recursive: true });
        fs.writeFileSync(
            bgXmlPath,
            `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#000000</color>\n</resources>\n`,
            'utf8'
        );

        const anyDpiDir = path.join(androidResDir, 'mipmap-anydpi-v26');
        fs.mkdirSync(anyDpiDir, { recursive: true });
        const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
        fs.writeFileSync(path.join(anyDpiDir, 'ic_launcher.xml'), adaptiveXml, 'utf8');
        fs.writeFileSync(path.join(anyDpiDir, 'ic_launcher_round.xml'), adaptiveXml, 'utf8');

        for (const target of MIPMAP_TARGETS) {
            const mipmapDir = path.join(androidResDir, target.folder);
            fs.mkdirSync(mipmapDir, { recursive: true });

            await renderSvgToPng(
                legacySquareSvg,
                path.join(mipmapDir, 'ic_launcher.png'),
                target.legacySize
            );
            await renderSvgToPng(
                legacyRoundSvg,
                path.join(mipmapDir, 'ic_launcher_round.png'),
                target.legacySize
            );
            await renderSvgToPng(
                adaptiveForegroundSvg,
                path.join(mipmapDir, 'ic_launcher_foreground.png'),
                target.adaptiveSize
            );
            console.log(
                `✅ Generated ${target.folder} (legacy: ${target.legacySize}px, adaptive foreground: ${target.adaptiveSize}px)`
            );
        }
    }

    // 3. If src-tauri/ exists, generate desktop .ico / .icns / .png icons in src-tauri/icons/
    const tauriDir = path.join(ROOT_DIR, 'src-tauri');
    if (fs.existsSync(tauriDir)) {
        const masterPng = path.join(os.tmpdir(), `shr-master-1024-${process.pid}.png`);
        await renderSvgToPng(legacySquareSvg, masterPng, 1024);
        const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
        const res = spawnSync(npxCmd, ['tauri', 'icon', masterPng], {
            cwd: ROOT_DIR,
            stdio: 'inherit',
        });
        if (fs.existsSync(masterPng)) {
            fs.unlinkSync(masterPng);
        }
        if (res.status === 0) {
            console.log(`✅ Generated Tauri desktop icons (.ico, .icns, .png) in src-tauri/icons/`);
        }
    }

    console.log(`🎉 All Android, Web & Desktop icons cleanly generated from shr-logo.svg!`);
}

main().catch((err) => {
    console.error('❌ Icon build failed:', err.message || err);
    process.exit(1);
});
