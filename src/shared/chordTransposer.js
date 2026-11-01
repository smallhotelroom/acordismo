/**
 * @file src/shared/chordTransposer.js
 * @version 3.1.0
 */
import {
    CHORD_GROUP_DELIMITER_REGEX,
    CHORD_GROUP_DELIMITER_SOURCE,
    SKIP_PAREN_PREFIXES,
} from './songSchema.js';

export const __version__ = '3.1.0';

export { CHORD_GROUP_DELIMITER_REGEX, CHORD_GROUP_DELIMITER_SOURCE, SKIP_PAREN_PREFIXES };

export const SHARP_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLAT_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const NOTE_TO_SEMITONE = {
    C: 0,
    'B#': 0,
    'C#': 1,
    Db: 1,
    D: 2,
    'D#': 3,
    Eb: 3,
    E: 4,
    Fb: 4,
    F: 5,
    'E#': 5,
    'F#': 6,
    Gb: 6,
    G: 7,
    'G#': 8,
    Ab: 8,
    A: 9,
    'A#': 10,
    Bb: 10,
    B: 11,
    Cb: 11,
};

const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const FLAT_TONICS = new Set([5, 10, 3, 8, 1]); // F, Bb, Eb, Ab, Db
const SHARP_TONICS = new Set([7, 2, 9, 4, 11]); // G, D, A, E, B

/**
 * Normalizes a semitone offset into [0..11].
 */
export function mod12(n) {
    return ((n % 12) + 12) % 12;
}

/**
 * Parses a single chord token like "F#m7b5/C#" into its root, quality, and optional bass note.
 * Returns null if the token does not begin with a valid musical note.
 */
export function parseChordToken(token) {
    if (!token || typeof token !== 'string') {
        return null;
    }
    const trimmed = token.trim();
    if (!trimmed) {
        return null;
    }

    const match = /^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/.exec(trimmed);
    if (!match) {
        return null;
    }

    const [, rootStr, rawQuality = '', bassStr = null] = match;
    const rootSemitone = NOTE_TO_SEMITONE[rootStr];
    if (rootSemitone === undefined) {
        return null;
    }

    if (
        rawQuality &&
        !/^(?:m|maj|min|dim|aug|sus|add|[0-9]|[#b+-]|M|\(|\))*$/i.test(rawQuality)
    ) {
        return null;
    }

    let bassSemitone = null;
    if (bassStr) {
        bassSemitone = NOTE_TO_SEMITONE[bassStr];
        if (bassSemitone === undefined) {
            return null;
        }
    }

    const isMinor = rawQuality.startsWith('m') && !rawQuality.startsWith('maj');

    return {
        rootStr,
        rootSemitone,
        quality: rawQuality,
        isMinor,
        bassStr,
        bassSemitone,
    };
}

function evaluatePaletteCollisions(palette, pitchClassCounts, rootPitchClassSet) {
    const letterToPitchClasses = new Map();
    const letterToTotalCount = new Map();

    for (const [pc, count] of pitchClassCounts.entries()) {
        const noteName = palette[pc];
        const letter = noteName[0];
        if (!letterToPitchClasses.has(letter)) {
            letterToPitchClasses.set(letter, new Set());
            letterToTotalCount.set(letter, 0);
        }
        letterToPitchClasses.get(letter).add(pc);
        letterToTotalCount.set(letter, letterToTotalCount.get(letter) + count);
    }

    let uniqueLetterCollisions = 0;
    let weightedCollisionScore = 0;

    for (const [, pcSet] of letterToPitchClasses.entries()) {
        if (pcSet.size > 1) {
            const rootHits = [...pcSet].filter((pc) => rootPitchClassSet.has(pc));
            uniqueLetterCollisions += pcSet.size - 1;

            const counts = [...pcSet]
                .map((pc) => pitchClassCounts.get(pc) || 1)
                .sort((a, b) => a - b);
            const minorOccurrences = counts.slice(0, -1).reduce((acc, v) => acc + v, 0);
            weightedCollisionScore += minorOccurrences * (rootHits.length > 1 ? 10 : 3);
        }
    }

    return {
        uniqueLetterCollisions,
        weightedCollisionScore,
    };
}

/**
 * Deduces whether a song (after transposing by `semitones`) should be spelled
 * using the Flat palette (`true`) or Sharp palette (`false`).
 */
export function deduceSongUseFlats(lyrics = '', semitones = 0, songKeyHint = null) {
    const pitchClassCounts = new Map();
    const rootPitchClassSet = new Set();
    const chordQualities = [];
    let originalFlatsCount = 0;
    let originalSharpsCount = 0;

    const addPitchClass = (pc, weight = 1, isRoot = true) => {
        pitchClassCounts.set(pc, (pitchClassCounts.get(pc) || 0) + weight);
        if (isRoot) {
            rootPitchClassSet.add(pc);
        }
    };

    const parenRegex = /\(([^)]+)\)/g;
    let match;
    while ((match = parenRegex.exec(lyrics)) !== null) {
        const fullParen = match[0].toLowerCase();
        if (SKIP_PAREN_PREFIXES.some((prefix) => fullParen.startsWith(prefix))) {
            continue;
        }
        if (fullParen.includes('capo') || fullParen.includes('drop')) {
            continue;
        }

        const tokens = match[1].split(CHORD_GROUP_DELIMITER_REGEX);
        for (const rawTok of tokens) {
            const parsed = parseChordToken(rawTok);
            if (!parsed) {
                continue;
            }
            if (parsed.rootStr.includes('b')) {
                originalFlatsCount++;
            } else if (parsed.rootStr.includes('#')) {
                originalSharpsCount++;
            }
            if (parsed.bassStr?.includes('b')) {
                originalFlatsCount++;
            } else if (parsed.bassStr?.includes('#')) {
                originalSharpsCount++;
            }

            const transposedRoot = mod12(parsed.rootSemitone + semitones);
            addPitchClass(transposedRoot, 2, true);
            chordQualities.push({ rootPc: transposedRoot, isMinor: parsed.isMinor });

            if (parsed.bassSemitone !== null) {
                const transposedBass = mod12(parsed.bassSemitone + semitones);
                addPitchClass(transposedBass, 1, false);
            }
        }
    }

    const hasBlackKeys = [...pitchClassCounts.keys()].some((pc) =>
        [1, 3, 6, 8, 10].includes(pc)
    );
    if (!hasBlackKeys) {
        return false;
    }

    const sharpEval = evaluatePaletteCollisions(
        SHARP_NOTES,
        pitchClassCounts,
        rootPitchClassSet
    );
    const flatEval = evaluatePaletteCollisions(
        FLAT_NOTES,
        pitchClassCounts,
        rootPitchClassSet
    );

    if (sharpEval.uniqueLetterCollisions !== flatEval.uniqueLetterCollisions) {
        return flatEval.uniqueLetterCollisions < sharpEval.uniqueLetterCollisions;
    }
    if (sharpEval.weightedCollisionScore !== flatEval.weightedCollisionScore) {
        return flatEval.weightedCollisionScore < sharpEval.weightedCollisionScore;
    }

    if (mod12(semitones) === 0 && originalFlatsCount !== originalSharpsCount) {
        return originalFlatsCount > originalSharpsCount;
    }

    if (songKeyHint && typeof songKeyHint === 'string') {
        const parsedHint = parseChordToken(songKeyHint.trim());
        if (parsedHint) {
            const majorTonic = mod12(
                parsedHint.rootSemitone + semitones + (parsedHint.isMinor ? 3 : 0)
            );
            if (FLAT_TONICS.has(majorTonic)) {
                return true;
            }
            if (SHARP_TONICS.has(majorTonic)) {
                return false;
            }
        }
    }

    let bestTonic = 0;
    let bestScore = -Infinity;

    for (let tonic = 0; tonic < 12; tonic++) {
        const scaleSet = new Set(MAJOR_SCALE_INTERVALS.map((i) => mod12(tonic + i)));
        let score = 0;

        for (const [pc, count] of pitchClassCounts.entries()) {
            if (scaleSet.has(pc)) {
                score += count * 3;
            }
        }

        for (const cq of chordQualities) {
            const rel = mod12(cq.rootPc - tonic);
            if (rel === 0 && !cq.isMinor) score += 4;
            if (rel === 5 && !cq.isMinor) score += 2;
            if (rel === 7 && !cq.isMinor) score += 3;
            if (rel === 9 && cq.isMinor) score += 4;
            if (rel === 2 && cq.isMinor) score += 2;
            if (rel === 4 && cq.isMinor) score += 2;
        }

        if (score > bestScore) {
            bestScore = score;
            bestTonic = tonic;
        }
    }

    if (FLAT_TONICS.has(bestTonic)) {
        return true;
    }
    if (SHARP_TONICS.has(bestTonic)) {
        return false;
    }

    const flatSignatureWeight =
        (pitchClassCounts.get(10) || 0) + (pitchClassCounts.get(3) || 0);
    const sharpSignatureWeight =
        (pitchClassCounts.get(6) || 0) + (pitchClassCounts.get(1) || 0);

    return flatSignatureWeight > sharpSignatureWeight;
}

/**
 * Transposes a single chord token (e.g., "Am", "G/B", "F#m7b5") by `semitones`.
 */
export function transposeChordToken(token, semitones = 0, useFlats = null) {
    if (!token || typeof token !== 'string') {
        return token;
    }

    const parsed = parseChordToken(token);
    if (!parsed) {
        return token;
    }

    const resolvedUseFlats =
        typeof useFlats === 'boolean'
            ? useFlats
            : mod12(semitones) === 0
              ? parsed.rootStr.includes('b') || Boolean(parsed.bassStr?.includes('b'))
              : FLAT_TONICS.has(mod12(parsed.rootSemitone + semitones));

    const palette = resolvedUseFlats ? FLAT_NOTES : SHARP_NOTES;

    const newRoot = palette[mod12(parsed.rootSemitone + semitones)];
    let newBass = '';
    if (parsed.bassSemitone !== null) {
        newBass = '/' + palette[mod12(parsed.bassSemitone + semitones)];
    }

    const leadingSpace = token.match(/^\s*/)?.[0] || '';
    const trailingSpace = token.match(/\s*$/)?.[0] || '';

    return `${leadingSpace}${newRoot}${parsed.quality}${newBass}${trailingSpace}`;
}

export function transposeChordGroupInner(chordGroupInner, semitones = 0, useFlats = false) {
    const lower = chordGroupInner.toLowerCase();
    if (
        SKIP_PAREN_PREFIXES.some((p) => `(${lower}`.startsWith(p)) ||
        lower.includes('bpm')
    ) {
        return chordGroupInner;
    }

    let remaining = chordGroupInner;
    let out = '';

    while (remaining.length > 0) {
        const delimMatch = CHORD_GROUP_DELIMITER_REGEX.exec(remaining);
        if (delimMatch !== null) {
            const treatable = remaining.slice(0, delimMatch.index);
            const delimStr = delimMatch[0];
            remaining = remaining.slice(delimMatch.index + delimStr.length);
            if (treatable.length > 0) {
                out += transposeChordToken(treatable, semitones, useFlats);
            }
            out += delimStr;
        } else {
            out += transposeChordToken(remaining, semitones, useFlats);
            break;
        }
    }

    return out;
}

export function transposeSongContents(
    contents,
    globalSemitones = 0,
    { applyCapoDropCorrection = false, frontmatterCapo = 0, songKeyHint = null } = {}
) {
    let songHalfTones =
        globalSemitones + (applyCapoDropCorrection ? Number(frontmatterCapo || 0) : 0);
    const useFlats = deduceSongUseFlats(contents, songHalfTones, songKeyHint);

    return contents.replace(/\(([^)]*)\)/g, (fullMatch, inner) => {
        const lower = fullMatch.toLowerCase();
        if (SKIP_PAREN_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
            return fullMatch;
        }
        if (lower.includes('capo')) {
            if (applyCapoDropCorrection) {
                const nums = fullMatch.match(/\d+/g);
                if (nums && nums.length === 1) {
                    songHalfTones += parseInt(nums[0], 10);
                    return `(chords for no capo; generated from ${inner})`;
                }
            }
            return fullMatch;
        }
        if (lower.includes('drop')) {
            if (applyCapoDropCorrection) {
                const nums = fullMatch.match(/\d+/g);
                if (nums && nums.length === 1) {
                    songHalfTones -= parseInt(nums[0], 10);
                    return `(chords for no drop; generated from ${inner})`;
                }
            }
            return fullMatch;
        }

        const currentUseFlats =
            deduceSongUseFlats(contents, songHalfTones, songKeyHint) ?? useFlats;
        return `(${transposeChordGroupInner(inner, songHalfTones, currentUseFlats)})`;
    });
}
