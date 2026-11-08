/**
 * @file src/shared/songSections.js
 * @version 1.1.0
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
    parseFingeringDefinitionLine,
} from '../../../smallhotelroom.github.io/src/shared/songSchema.js';
import { transposeChordToken } from '../../../smallhotelroom.github.io/src/shared/chordTransposer.js';

export const __version__ = '1.1.0';

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
                const parsed = parseFingeringDefinitionLine(fLine);
                if (parsed && parsed.valid) {
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
 * Shifts a song's `customVoicings` map by `transposition` semitones so that if a song defines
 * `C#aug: x4322x` and the user transposes by +2, clicking `D#aug` resolves to `x6544x`.
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
            // Only shift frets if all sounded strings remain >= 0
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
            }
        }
    }
    return out;
}
