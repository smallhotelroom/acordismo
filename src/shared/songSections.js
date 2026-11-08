/**
 * @file src/shared/songSections.js
 * @version 1.2.0
 * Parses Markdown `## Section` blocks inside song contents into:
 * - `mainContent`: Primary chord & lyric sheet (before the first `##` header)
 * - `translations`: Array of `{ lang, content }` for language translations (e.g. `## Español`)
 * - `fingerings`: Raw `{ title, content }` blocks for `## Chords` / `## Fingerings`
 * - `customVoicings`: Structured `{ guitar: { [chordName]: { frets, label } }, ukulele: { ... } }`
 */
import {
    FINGERING_SECTION_HEADER_REGEX,
    NOTES_SECTION_HEADER_REGEX,
    SECTION_HEADER_REGEX,
} from '../../../smallhotelroom.github.io/src/shared/songSchema.js';
import { transposeChordToken } from '../../../smallhotelroom.github.io/src/shared/chordTransposer.js';

export const __version__ = '1.2.0';

/**
 * Permissive runtime parser for a `Chord: frets` line so `SongScreen` always renders
 * whatever custom posture was written in `## Chords` (even while you are experimenting with voicings).
 */
function parseRuntimeFingeringLine(rawLine = '') {
    const trimmed = String(rawLine || '').replace(/\s+#.*$/, '').trim();
    if (!trimmed || trimmed.startsWith('#')) return null;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) return null;

    const leftSide = trimmed.slice(0, colonIdx).trim();
    let rightSide = trimmed.slice(colonIdx + 1).trim();

    let explicitInstrument = null;
    let chordName = leftSide;
    const instMatch = /^(\S+)\s+\((guitar|gtr|uke|ukulele)\)$/i.exec(leftSide);
    if (instMatch) {
        chordName = instMatch[1].trim();
        explicitInstrument = instMatch[2].toLowerCase().startsWith('uk')
            ? 'ukulele'
            : 'guitar';
    }

    let label = null;
    const quoteMatch = /^(.*?)\s+["'](.+)["']\s*$/.exec(rightSide);
    if (quoteMatch) {
        rightSide = quoteMatch[1].trim();
        label = quoteMatch[2].trim();
    }

    const rawFretTokens =
        /^[xX0-9]{4}$/.test(rightSide) || /^[xX0-9]{6}$/.test(rightSide)
            ? rightSide.split('')
            : rightSide.split(/[\s,-]+/).filter(Boolean);

    if (rawFretTokens.length !== 6 && rawFretTokens.length !== 4) {
        return null;
    }

    const frets = [];
    for (const tok of rawFretTokens) {
        if (/^[xX]$/.test(tok)) {
            frets.push(-1);
        } else if (/^\d+$/.test(tok)) {
            frets.push(parseInt(tok, 10));
        } else {
            return null;
        }
    }

    const instrument = explicitInstrument || (frets.length === 4 ? 'ukulele' : 'guitar');
    return { chordName, instrument, frets, label };
}

/**
 * Splits raw song contents into structured sections based on `## Header` lines,
 * and parses any `## Chords` / `## Fingerings` definitions into `customVoicings`.
 */
export function parseSongSections(rawContents = '', primaryLang = 'Original') {
    const normalized = String(rawContents || '').replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');

    const mainLines = [];
    const rawSections = [];
    let currentSection = null;

    for (const line of lines) {
        const match = SECTION_HEADER_REGEX.exec(line);
        if (match) {
            currentSection = {
                title: match[1].trim(),
                lines: [],
            };
            rawSections.push(currentSection);
            continue;
        }

        if (currentSection) {
            currentSection.lines.push(line);
        } else {
            mainLines.push(line);
        }
    }

    const mainContent = mainLines.join('\n').replace(/[\s\n]+$/, '');
    const translations = [];
    const fingerings = [];
    const otherSections = [];
    const customVoicings = {
        guitar: {},
        ukulele: {},
    };

    for (const sec of rawSections) {
        const body = sec.lines.join('\n').replace(/^[\s\n]+|[\s\n]+$/g, '');
        if (!body) continue;

        if (FINGERING_SECTION_HEADER_REGEX.test(sec.title)) {
            fingerings.push({ title: sec.title, content: body });
            for (const fLine of sec.lines) {
                const parsed = parseRuntimeFingeringLine(fLine);
                if (parsed) {
                    customVoicings[parsed.instrument][parsed.chordName] = {
                        frets: parsed.frets,
                        label: parsed.label || null,
                    };
                }
            }
        } else if (NOTES_SECTION_HEADER_REGEX.test(sec.title)) {
            otherSections.push({ title: sec.title, content: body });
        } else {
            translations.push({ lang: sec.title, content: body });
        }
    }

    return {
        primaryLang: primaryLang || 'Original',
        mainContent,
        translations,
        fingerings,
        customVoicings,
        otherSections,
    };
}

/**
 * Maps a song's `customVoicings` to the currently displayed (possibly transposed) chord names.
 */
export function buildTransposedCustomVoicings(
    customVoicings,
    transposition = 0,
    useFlats = false
) {
    if (!customVoicings) {
        return { guitar: {}, ukulele: {} };
    }
    if (!transposition) {
        return customVoicings;
    }

    const out = { guitar: {}, ukulele: {} };
    for (const inst of ['guitar', 'ukulele']) {
        const srcMap = customVoicings[inst] || {};
        for (const [origChord, def] of Object.entries(srcMap)) {
            const shiftedChord = transposeChordToken(origChord, transposition, useFlats);
            const canShiftDirectly = def.frets.every(
                (f) => f === -1 || (f + transposition >= 0 && f + transposition <= 22)
            );
            if (canShiftDirectly) {
                out[inst][shiftedChord] = {
                    frets: def.frets.map((f) => (f === -1 ? -1 : f + transposition)),
                    label: def.label
                        ? `${def.label} (shifted from ${origChord})`
                        : `Song posture (shifted from ${origChord})`,
                };
            } else {
                // Keep original custom posture available under its original chord name too
                out[inst][origChord] = def;
            }
        }
    }
    return out;
}
