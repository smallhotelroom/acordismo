#!/usr/bin/env node
/**
 * @file scripts/build-icons.mjs
 * @version 1.0.0
 * Generates Android launcher icons (ic_launcher, ic_launcher_round, ic_launcher_foreground)
 * across all mipmap-* densities and updates public/favicon.svg from acordismo-logo.svg
 * with a pure white (#ffffff) symbol on a pure black (#000000) background.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const __version__ = '1.0.0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const CANDIDATE_LOGO_PATHS = [
    path.join(ROOT_DIR, 'acordismo-logo.svg'),
    path.join(ROOT_DIR, 'public', 'acordismo-logo.svg'),
    path.join(ROOT_DIR, 'src', 'assets', 'acordismo-logo.svg'),
];

// Standard Android launcher densities
constMIPMAP_TARGETS = [
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
        `Could not find 'acordismo-logo.svg'. Place it in ${ROOT_DIR} or pass its path to build-icons.mjs.`
    );
}

/**
 * Extracts viewBox dimensions and inner SVG body, and wraps the artwork so
 * the symbol renders in pure white (#ffffff) on a black (#000000) or transparent background
 * with configurable safe-zone padding.
 */
function buildPaddedSvg(rawSvg, { includeBlackBg = true, scaleRatio = 0.72, circleClip = false } = {}) {
    const viewBoxMatch = rawSvg.match(/viewBox=["']\s*([-\d.]+)\s+([-\d.]+)\s+([\d.]+)\s+([\d.]+)\s*["']/i);
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

    // Extract inner contents of <svg ...>...</svg>
    let inner = rawSvg
        .replace(/<\?xml[^>]*\?>/gi, '')
        .replace(/<!DOCTYPE[^>]*>/gi, '')
        .replace(/^[\s\S]*?<svg[^>]*>/i, '')
        .replace(/<\/svg>[\s\S]*$/i, '');

    // Remove any full-bleed background <rect> if present so our clean black background & white fill rule apply
    inner = inner
        .replace(/fill=["']#000(?:000)?["']/gi, 'fill="#ffffff"')
        .replace(/fill:\s*#000(?:000)?/gi, 'fill:#ffffff')
        .replace(/fill=["']black["']/gi, 'fill="#ffffff"');

    const offsetX = (vbW * (1 - scaleRatio)) / 2 - minX * scaleRatio;
    const offsetY = (vbH * (1 - scaleRatio)) / 2 - minY * scaleRatio;

    const clipDef = circleClip
        ? `<defs><clipPath id="roundClip"><circle cx="${vbW / 2}" cy="${vbH / 2}" r="${Math.min(vbW, vbH) / 2}" /></clipPath></defs>`
        : '';
    const clipAttr = circleClip ? ' clip-path="url(#roundClip)"' : '';
    const bgRect = includeBlackBg
        ? `<rect x="0" y="0" width="${vbW}" height="${vbH}" fill="#000000" />`
        : '';

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${vbH}" width="${vbW}" height="${vbH}">
  ${clipDef}
  <g${clipAttr}>
    ${bgRect}
    <g transform="translate(${offsetX.toFixed(3)}, ${offsetY.toFixed(3)}) scale(${scaleRatio})" fill="#ffffff" color="#ffffff">
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
    const tmpSvg = path.join(os.tmpdir(), `acordismo-icon-${ process.pid }.svg`);
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
                    `--export-Width=${sizePx}`,
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
        // Fallback: try npm 'sharp' if installed
        try {
            const sharpMod = await import('sharp');
            const sharp = sharpMod.default || sharpMod;
            await sharp(Buffer.from(svgString))
                .resize(sizePx, sizePx)
                .png()
                .toFile(outPngPath);
            return;
        } catch {
            // ignore
        }

        throw new Error(
            `No SVG->PNG rasterizer found. On Ubuntu, run: sudo apt install librsvg2-bin (or imagemagick).`
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

    // 1. Write web favicon.svg (square black badge with white symbol)
    const webFaviconSvg = buildPaddedSvg(rawSvg, {
        includeBlackBg: true,
        scaleRatio: 0.84,
        circleClip: false,
    });
    const publicFaviconPath = path.join(ROOT_DIR, 'public', 'favicon.svg');
    fs.writeFileSync(publicFaviconPath, webFaviconSvg, 'utf8');
    console.log(`✅ Updated web favicon: public/favicon.svg`);

    // 2. Prepare Android SVG variants:
    // - Legacy square icon (80% scale on solid black background)
    const legacySquareSvg = buildPaddedSvg(rawSvg, {
        includeBlackBg: true,
        scaleRatio: 0.8,
        circleClip: false,
    });
    // - Legacy round icon (76% scale clipped to circle on solid black background)
    const legacyRoundSvg = buildPaddedSvg(rawSvg, {
        includeBlackBg: true,
        scaleRatio: 0.76,
        circleClip: true,
    });
    // - Adaptive foreground icon (60% safe-zone scale on transparent background; background color is #000000 XML)
    const adaptiveForegroundSvg = buildPaddedSvg(rawSvg, {
        includeBlackBg: false,
        scaleRatio: 0.6,
        circleClip: false,
    });

    const androidResDir = path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'res');
    if (!fs.existsSync(androidResDir)) {
        console.log(`ℹ️  Android res directory not found at ${androidResDir}; skipping Android PNG generation.`);
        return;
    }

    // 3. Set Android adaptive icon background color to pure black (#000000)
    const bgXmlPath = path.join(androidResDir, 'values', 'ic_launcher_background.xml');
    fs.mkdirSync(path.dirname(bgXmlPath), { recursive: true });
    const bgXmlContent = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#000000</color>
</resources>
`;
    fs.writeFileSync(bgXmlPath, bgXmlContent, 'utf8');
    console.log(`✅ Updated Android adaptive background color to #000000 (${bgXmlPath})`);

    // 4. Render all mipmap-* PNGs
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

    console.log(`🎉 All Android & Web icons generated from acordismo-logo.svg!`);
}

main().catch((err) => {
    console.error('❌ Icon build failed:', err.message || err);
    process.exit(1);
});
