/**
 * @file src/shared/songSections.js
 * @version 1.0.0
 * Parses Markdown `## Section` blocks inside song contents into:
 * - `mainContent`: Primary chord & lyric sheet (before the first `##` header)
 * - `translations`: Array of `{ lang, content }` for language translations (e.g. `## Español`)
 * - `fingerings`: Array of `{ title, content }` reserved for future song-specific chord fingerings (`## Fingerings`, `## Chords`)
 */

export const __version__ = '1.0.0';

const FINGERING_SECTION_REGEX = /^(?:fingerings?|chords?|voicings?|acordes?|posiciones?)$/i;
const NOTES_SECTION_REGEX = /^(?:notes?|notas?|comments?|tabs?|tablature)$/i;

/**
 * Splits raw song contents into structured sections based on `## Header` lines.
 */
export function parseSongSections(rawContents = '', primaryLang = 'Original') {
    const normalized = String(rawContents || '').replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');

    const mainLines = [];
    const rawSections = [];
    let currentSection = null;

    for (const line of lines) {
        const match = /^##\s+(.+?)\s*$/.exec(line);
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

    for (const sec of rawSections) {
        const body = sec.lines.join('\n').replace(/^[\s\n]+|[\s\n]+$/g, '');
        if (!body) continue;

        if (FINGERING_SECTION_REGEX.test(sec.title)) {
            fingerings.push({ title: sec.title, content: body });
        } else if (NOTES_SECTION_REGEX.test(sec.title)) {
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
        otherSections,
    };
}
