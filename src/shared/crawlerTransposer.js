/**
 * @file src/shared/crawlerTransposer.js
 * @version 1.6.0
 * Crawler-specific chord line heuristics, ASCII tablature stripper, and key deduction adapter.
 * Imports core harmony/chord logic directly from local `./chordTransposer.js`.
 */
import {
    deduceSongKey,
    deduceSongKeyInfo,
    deduceSongUseFlats,
    parseChordToken,
} from './chordTransposer.js';

export const __version__ = '1.6.0';

/**
 * Splits leading and trailing punctuation (such as `(`, `)`, `[`, `]`, `,`, `:`, `;`)
 * from a whitespace-delimited token so standalone chord tokens can be tested cleanly.
 */
export function stripOuterPunctuation(rawWord = '') {
    const match = /^([([{"'¡¿]*)(.*?)([)\]}"'.,;:!?]*)$/.exec(String(rawWord || ''));
    if (!match) {
        return { prefix: '', core: rawWord, suffix: '' };
    }
    return {
        prefix: match[1] || '',
        core: match[2] || '',
        suffix: match[3] || '',
    };
}

const CRAWLER_SECTION_PREFIX_REGEX =
    /^(?:intro|int|outro|verso|verse|estribillo|coro|chorus|puente|bridge|solo|punteo|interludio|interlude|pre-?estribillo|pre-?chorus|riff|acordes|chords|final|coda|instrumental|inst|parte\s*\d+|estrofa)\s*[:.-]?\s*/i;

const CRAWLER_ANNOTATION_REGEX =
    /^(?:x\d+|\d+x|bis|rep(?:etir)?|arpegio|rasgueo|palm\s*mute|pm|mute|fade\s*out|rit\.?)$/i;

/**
 * Detects whether a line in a curated song (without `(...)` groups) is a standalone chord line.
 */
export function isStandaloneChordLine(lineText = '') {
    const trimmed = String(lineText || '').trim();
    if (!trimmed) return false;

    const withoutPrefix = trimmed.replace(CRAWLER_SECTION_PREFIX_REGEX, '').trim();
    if (!withoutPrefix) return false;

    const words = withoutPrefix.split(/\s+/).filter(Boolean);
    if (words.length === 0) return false;

    let chordCount = 0;
    for (const w of words) {
        const { core } = stripOuterPunctuation(w);
        if (!core) continue;
        if (parseChordToken(core) !== null) {
            chordCount++;
        } else if (!CRAWLER_ANNOTATION_REGEX.test(core)) {
            return false;
        }
    }
    return chordCount > 0;
}

/**
 * Detects whether a line in a crawler song (`origin_id > 0`) is a chord line.
 * Handles inline remarks like `Intro: A B C F# (I will learn this better)` or `Am  F  C  G  x2`.
 */
export function isCrawlerChordLine(lineText = '') {
    const trimmed = String(lineText || '').trim();
    if (!trimmed || trimmed.length > 140) return false;

    // Exclude ASCII guitar/bass tablature lines (e.g. e|---0---2---|)
    if (/^[eEbBgGdDaA1-6]?\|[-0-9hHpPbBrRsS/\\~xX*+|:\s]{4,}/.test(trimmed)) {
        return false;
    }
    if (/^[-|0-9hHpPbBrRsS/\\~xX\s]{8,}$/.test(trimmed) && trimmed.includes('---')) {
        return false;
    }

    // Strip parenthetical remarks and section prefixes before counting chords vs non-chord words
    const strippedParens = trimmed.replace(/\([^)]*\)/g, ' ');
    const withoutPrefix = strippedParens.replace(CRAWLER_SECTION_PREFIX_REGEX, '').trim();
    if (!withoutPrefix) return false;

    const words = withoutPrefix.split(/\s+/).filter(Boolean);
    if (words.length === 0) return false;

    let chordCount = 0;
    let nonChordCount = 0;

    for (const w of words) {
        const { core } = stripOuterPunctuation(w);
        if (!core) continue;
        if (parseChordToken(core) !== null) {
            chordCount++;
        } else if (!CRAWLER_ANNOTATION_REGEX.test(core)) {
            nonChordCount++;
        }
    }

    if (chordCount === 0) return false;
    if (nonChordCount === 0) return true;

    // Allow a line with a section label + predominantly chords
    return chordCount >= 2 && chordCount >= nonChordCount * 2;
}

/**
 * Detects if a line is an ASCII tablature staff line (e.g. `e|---0---3---|` or `G|---2---|`).
 */
export function isAsciiTabLine(lineText = '') {
    const trimmed = String(lineText || '').trim();
    if (!trimmed) return false;
    if (/^[eEbBgGdDaA1-6]{1,2}\s*[|:][-0-9hHpPbBrRsS/\\~xX*+|:\s]{3,}/.test(trimmed)) {
        return true;
    }
    const dashCount = (trimmed.match(/-/g) || []).length;
    if (dashCount >= 6 && /^[-|0-9hHpPbBrRsS/\\~xX*+:\s()[\]]+$/.test(trimmed)) {
        return true;
    }
    return false;
}

/**
 * Strips contiguous ASCII tablature blocks from crawler songs while preserving chord & lyric lines.
 */
export function stripCrawlerTabSections(rawText = '') {
    const lines = String(rawText || '').replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
        if (isAsciiTabLine(lines[i])) {
            while (i < lines.length && (isAsciiTabLine(lines[i]) || !lines[i].trim())) {
                i++;
            }
            if (out.length > 0 && out[out.length - 1].trim() !== '') {
                out.push('');
            }
            continue;
        }
        out.push(lines[i]);
        i++;
    }

    return out
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/^[\s\n]+|[\s\n]+$/g, '');
}

/**
 * Checks whether a crawler song contains actual playable chords (and isn't just an ASCII tab or empty text).
 */
export function hasCrawlerSongAndChords(rawText = '') {
    const stripped = stripCrawlerTabSections(rawText);
    if (!stripped) return false;
    const lines = stripped.split('\n');
    for (const line of lines) {
        if (isCrawlerChordLine(line)) {
            return true;
        }
    }
    return false;
}

/**
 * Extracts parsed chord objects from crawler songs (or mixed standalone lines).
 */
export function extractCrawlerChordsFromLyrics(lyrics = '') {
    const parsedChords = [];
    const lines = String(lyrics || '').split('\n');

    for (const line of lines) {
        if (!isCrawlerChordLine(line)) continue;
        const words = line.split(/\s+/).filter(Boolean);
        for (const w of words) {
            const { core } = stripOuterPunctuation(w);
            if (!core) continue;
            const parsed = parseChordToken(core);
            if (parsed) {
                parsedChords.push(parsed);
            }
        }
    }
    return parsedChords;
}

export function deduceShrSongUseFlats(
    lyrics = '',
    semitones = 0,
    songKeyHint = null,
    originId = 0
) {
    const isCrawler = Number(originId || 0) > 0;
    return deduceSongUseFlats(
        lyrics,
        semitones,
        songKeyHint,
        isCrawler ? extractCrawlerChordsFromLyrics : null
    );
}

export function deduceShrSongKeyInfo(
    lyrics = '',
    semitones = 0,
    songKeyHint = null,
    originId = 0
) {
    const isCrawler = Number(originId || 0) > 0;
    return deduceSongKeyInfo(
        lyrics,
        semitones,
        songKeyHint,
        isCrawler ? extractCrawlerChordsFromLyrics : null
    );
}

export function deduceShrSongKey(
    lyrics = '',
    semitones = 0,
    songKeyHint = null,
    originId = 0
) {
    const isCrawler = Number(originId || 0) > 0;
    return deduceSongKey(
        lyrics,
        semitones,
        songKeyHint,
        isCrawler ? extractCrawlerChordsFromLyrics : null
    );
}
