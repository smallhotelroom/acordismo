/**
 * @file src/shared/crawlerTransposer.js
 * @version 1.1.0
 * Crawler-specific (OrigenZK / OrigenLK) chord line detection, ASCII tablature stripping,
 * mixed-text chord extraction, and harmonic analysis wrappers for Acordismo.
 * Keeps `smallhotelroom.github.io/src/shared/chordTransposer.js` 100% pure for curated songs.
 */
import {
    deduceSongKey,
    deduceSongKeyInfo,
    deduceSongUseFlats,
    extractCuratedChordsFromLyrics,
    parseChordToken,
    transposeChordToken,
} from '../../../smallhotelroom.github.io/src/shared/chordTransposer.js';

export const __version__ = '1.1.0';

/**
 * Checks if a parsed chord is an unambiguous musical chord (e.g. F#, Am, G7, D/F#, Bb)
 * as opposed to a bare single capital letter (A-G) that could be a normal word ("A") in a lyric line.
 */
function isUnambiguousChord(parsed) {
    if (!parsed) return false;
    return (
        parsed.rootStr.length > 1 ||
        parsed.quality.length > 0 ||
        parsed.bassStr !== null
    );
}

/**
 * Cleans punctuation attached to a token in a crawler line (e.g. "(Am", "F#)", "G,")
 * while keeping internal chord slashes and modifiers intact.
 */
export function stripOuterPunctuation(rawWord) {
    const match = /^([([,:;-]*)(.*?)([)\],:;.!-]*)$/.exec(rawWord);
    if (!match) {
        return { prefix: '', core: rawWord, suffix: '' };
    }
    return {
        prefix: match[1] || '',
        core: match[2] || '',
        suffix: match[3] || '',
    };
}

/**
 * Detects whether a line in a crawler song is an ASCII guitar/bass tablature line
 * (e.g. "e|---0---2---|", "|---5h7---|", "------3-5-3------") or a pure divider line.
 */
export function isAsciiTabLine(lineText) {
    if (!lineText || typeof lineText !== 'string') {
        return false;
    }
    const trimmed = lineText.trim();
    if (!trimmed) {
        return false;
    }

    // 1. Classic string prefix followed by pipe or dashes: e|, B|, G|, D|, A|, E|, 1|, 2|, etc.
    if (/^[eEBGDAa1-6][#b]?\s*[|:].*[-─]{2,}/.test(trimmed)) {
        return true;
    }
    if (/^[eEBGDAa1-6][#b]?\s*[-─]{3,}/.test(trimmed)) {
        return true;
    }

    // 2. Pipe-delimited ASCII tab measure: |---0---2---| or ||--5--||
    if (/^\|+[-0-9hHpPbBrRsSvVxX/\\~()*|.\s]{4,}\|*$/.test(trimmed) && trimmed.includes('--')) {
        return true;
    }

    // 3. Dash-heavy line consisting almost exclusively of tab characters (-, digits, |, h, p, b, /, \, ~, x)
    const dashCount = (trimmed.match(/-/g) || []).length;
    if (dashCount >= 4) {
        const nonSpaceLen = trimmed.replace(/\s+/g, '').length;
        const tabCharsLen = (
            trimmed.match(/[-0-9|eEBGDAhHpPbBrRsSvVxX/\\~()*.:]/g) || []
        ).length;
        if (nonSpaceLen > 0 && tabCharsLen / nonSpaceLen >= 0.8) {
            return true;
        }
    }

    return false;
}

/**
 * Strips ASCII tablature blocks from crawler song contents while preserving all chord and lyric lines.
 * Also removes orphan "Riff:" / "Solo:" / "Tab:" single-line headers that immediately preceded a removed tab block,
 * and collapses 3+ consecutive empty lines down to a clean single empty line.
 */
export function stripCrawlerTabSections(contents = '') {
    const rawLines = String(contents || '').replace(/\r\n/g, '\n').split('\n');
    const keptLines = [];
    let removedTabInCurrentBlock = false;

    for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i];
        if (isAsciiTabLine(line)) {
            removedTabInCurrentBlock = true;
            // If the immediately preceding kept line was just a short tab/riff header (e.g. "Riff 1:", "Solo:", "Punteo:")
            // with no chords on it, pop it so we don't leave an empty header behind!
            if (keptLines.length > 0) {
                const prev = keptLines[keptLines.length - 1].trim();
                if (
                    prev &&
                    !isCrawlerChordLine(prev) &&
                    /^(?:riff|solo|punteo|tab|tablatura|arpegio|intro\s*tab|bajo|bass)[\s0-9:.-]*$/i.test(
                        prev
                    )
                ) {
                    keptLines.pop();
                }
            }
            continue;
        }

        if (line.trim() === '') {
            if (removedTabInCurrentBlock) {
                removedTabInCurrentBlock = false;
                if (keptLines.length === 0 || keptLines[keptLines.length - 1].trim() === '') {
                    continue;
                }
            }
        } else {
            removedTabInCurrentBlock = false;
        }

        keptLines.push(line);
    }

    return keptLines
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/^[\s\n]+|[\s\n]+$/g, '');
}

/**
 * Determines if a crawler line (`OrigenZK` / `OrigenLK`) contains chords—either:
 * 1) A pure chord line (100% chords and optional repeat markers like x2, |), OR
 * 2) A mixed instruction + chord line like:
 *    - "play twice: A B C F#"
 *    - "Intro: A B C F# (I will learn this better)"
 *    while rejecting ASCII guitar tab lines (`e|---(12)---|`) and normal lyric sentences.
 */
export function isCrawlerChordLine(lineText) {
    if (!lineText || typeof lineText !== 'string') {
        return false;
    }
    const trimmed = lineText.trim();
    if (!trimmed) {
        return false;
    }
    // Reject ASCII tablature lines
    if (isAsciiTabLine(trimmed) || trimmed.includes('--') || /[eBGDAE]\|/.test(trimmed)) {
        return false;
    }

    const rawWords = trimmed.split(/\s+/);
    let validChordCount = 0;
    let unambiguousChordCount = 0;
    let nonChordWordCount = 0;
    let currentConsecutiveChords = 0;
    let maxConsecutiveChords = 0;

    for (const rawWord of rawWords) {
        const { core } = stripOuterPunctuation(rawWord);
        if (!core) continue;

        const parsed = parseChordToken(core);
        if (parsed !== null) {
            validChordCount++;
            if (isUnambiguousChord(parsed)) {
                unambiguousChordCount++;
            }
            currentConsecutiveChords++;
            if (currentConsecutiveChords > maxConsecutiveChords) {
                maxConsecutiveChords = currentConsecutiveChords;
            }
        } else if (/^(?:x\d+|\d+x|\||\/|-)$/i.test(core)) {
            continue;
        } else {
            nonChordWordCount++;
            currentConsecutiveChords = 0;
        }
    }

    if (validChordCount === 0) {
        return false;
    }

    if (nonChordWordCount === 0) {
        return true;
    }

    if (maxConsecutiveChords >= 3) {
        return true;
    }
    if (maxConsecutiveChords >= 2 && unambiguousChordCount >= 1) {
        return true;
    }

    return false;
}

/**
 * Returns true (`1`) if a crawler song has actual chords (after stripping ASCII guitar tabs),
 * or false (`0`) if the song is exclusively ASCII tablature or chordless text.
 */
export function hasCrawlerSongAndChords(contents = '') {
    const stripped = stripCrawlerTabSections(contents);
    if (!stripped) {
        return false;
    }
    const lines = stripped.split('\n');
    let chordLineCount = 0;
    let lyricOrTextLineCount = 0;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (isCrawlerChordLine(trimmed)) {
            chordLineCount++;
        } else {
            lyricOrTextLineCount++;
        }
    }

    // Must have at least 1 chord line AND (either lyrics/text or multiple chord lines)
    return chordLineCount >= 1 && (lyricOrTextLineCount >= 1 || chordLineCount >= 2);
}

/**
 * Strict check for lines that are 100% bare chords & spaces.
 */
export function isStandaloneChordLine(lineText) {
    if (!lineText || typeof lineText !== 'string') {
        return false;
    }
    const trimmed = lineText.trim();
    if (!trimmed || trimmed.includes('(') || trimmed.includes(')') || trimmed.includes('[')) {
        return false;
    }
    const tokens = trimmed.split(/\s+/);
    return tokens.length > 0 && tokens.every((tok) => parseChordToken(tok) !== null);
}

/**
 * Extracts all parsed chord objects from a crawler song (or hybrid song).
 */
export function extractCrawlerChordsFromLyrics(lyrics = '') {
    const parsedChords = [];
    for (const line of String(lyrics).split('\n')) {
        if (isCrawlerChordLine(line)) {
            for (const rawWord of line.trim().split(/\s+/)) {
                const { core } = stripOuterPunctuation(rawWord);
                if (core) {
                    const parsed = parseChordToken(core);
                    if (parsed) {
                        parsedChords.push(parsed);
                    }
                }
            }
        }
    }
    return parsedChords;
}

/**
 * Resolves the appropriate chord extractor based on whether the song is from a crawler layer.
 */
function getExtractorForOrigin(originId = 0) {
    return Number(originId || 0) > 0
        ? extractCrawlerChordsFromLyrics
        : extractCuratedChordsFromLyrics;
}

export function deduceAcordismoSongUseFlats(
    lyrics = '',
    semitones = 0,
    songKeyHint = null,
    originId = 0
) {
    return deduceSongUseFlats(
        lyrics,
        semitones,
        songKeyHint,
        getExtractorForOrigin(originId)
    );
}

export function deduceAcordismoSongKeyInfo(
    lyrics = '',
    semitones = 0,
    songKeyHint = null,
    originId = 0
) {
    return deduceSongKeyInfo(
        lyrics,
        semitones,
        songKeyHint,
        getExtractorForOrigin(originId)
    );
}

export function deduceAcordismoSongKey(
    lyrics = '',
    semitones = 0,
    songKeyHint = null,
    originId = 0
) {
    return deduceSongKey(
        lyrics,
        semitones,
        songKeyHint,
        getExtractorForOrigin(originId)
    );
}

export function transposeCrawlerChordLine(lineText, semitones = 0, useFlats = false) {
    return lineText.replace(/\S+/g, (rawWord) => {
        const { prefix, core, suffix } = stripOuterPunctuation(rawWord);
        if (core && parseChordToken(core) !== null) {
            return `${prefix}${transposeChordToken(core, semitones, useFlats)}${suffix}`;
        }
        return rawWord;
    });
}
