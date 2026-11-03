/**
 * @file src/shared/crawlerTransposer.js
 * @version 1.0.0
 * Crawler-specific (OrigenZK / OrigenLK) chord line detection, mixed-text chord extraction,
 * and harmonic analysis wrappers for Acordismo.
 * Keeps `smallhotelroom.github.io/src/shared/chordTransposer.js` 100% pure for curated songs.
 */
import {
    deduceSongKey,
    deduceSongKeyInfo,
    deduceSongUseFlats,
    extractCuratedChordsFromLyrics,
    parseChordToken,
    transposeChordToken,
} from '@shr-shared/chordTransposer.js';

export const __version__ = '1.0.0';

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
    // Reject ASCII tablature lines (e.g. "e|---(12)---|" or "----12----")
    if (trimmed.includes('--') || /[eBGDAE]\|/.test(trimmed)) {
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
