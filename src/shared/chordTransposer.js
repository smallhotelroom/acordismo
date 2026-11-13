/**
 * @file src/shared/chordTransposer.js
 * @version 5.1.1
 * Pure canonical chord parser, harmonic key/enharmonic analyzer, and parenthetical transposer
 * (hosted in Acordismo). Contains zero crawler-specific heuristics.
 * Biases enharmonic ties toward Sharps (`#`) when letter collisions are equal.
 */
import {
    SHARP_NOTES,
    FLAT_NOTES,
    NOTE_TO_SEMITONE,
    SKIP_PAREN_PREFIXES,
    DIRECTIVE_PAREN_REGEX,
    CHORD_GROUP_DELIMITER_REGEX,
    CHORD_QUALITY_REGEX,
    SYNTAX_PALETTE,
} from './songSchema.js';

export const __version__ = '5.1.1';

export {
    SHARP_NOTES,
    FLAT_NOTES,
    NOTE_TO_SEMITONE,
    SKIP_PAREN_PREFIXES,
    DIRECTIVE_PAREN_REGEX,
    CHORD_GROUP_DELIMITER_REGEX,
    CHORD_QUALITY_REGEX,
    SYNTAX_PALETTE,
};

const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const FLAT_TONICS = new Set([5, 10, 3]); // F, Bb, Eb (true guitar flat keys; Ab/Db tie-break to G#/C# when collision-free)
const SHARP_TONICS = new Set([7, 2, 9, 4, 11, 6, 1, 8]); // G, D, A, E, B, F#, C#, G#

export function mod12(n) {
    return ((n % 12) + 12) % 12;
}

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

    if (rawQuality && !CHORD_QUALITY_REGEX.test(rawQuality)) {
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

/**
 * Checks if the inside of a `(...)` group in curated songs contains valid chords
 * (and not directives or non-chord parenthetical remarks).
 */
export function isValidParenChordGroup(innerStr) {
    if (!innerStr || typeof innerStr !== 'string') {
        return false;
    }
    if (DIRECTIVE_PAREN_REGEX.test(innerStr)) {
        return false;
    }
    const tokens = innerStr.split(CHORD_GROUP_DELIMITER_REGEX);
    let chordCount = 0;
    for (const rawTok of tokens) {
        const trimmed = rawTok.trim();
        if (!trimmed) continue;
        if (parseChordToken(trimmed) !== null) {
            chordCount++;
        } else {
            return false;
        }
    }
    return chordCount > 0;
}

/**
 * Extracts all parsed chord objects from canonical parenthetical `(...)` notation.
 */
export function extractCuratedChordsFromLyrics(lyrics = '') {
    const parsedChords = [];
    const parenRegex = /\(([^)]+)\)/g;
    let match;

    while ((match = parenRegex.exec(lyrics)) !== null) {
        if (!isValidParenChordGroup(match[1])) {
            continue;
        }
        const tokens = match[1].split(CHORD_GROUP_DELIMITER_REGEX);
        for (const rawTok of tokens) {
            const parsed = parseChordToken(rawTok);
            if (parsed) {
                parsedChords.push(parsed);
            }
        }
    }

    return parsedChords;
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

export function analyzeSongHarmony(
    lyrics = '',
    semitones = 0,
    songKeyHint = null,
    customChordExtractor = null
) {
    const pitchClassCounts = new Map();
    const rootPitchClassSet = new Set();
    const chordQualities = [];
    let originalFlatsCount = 0;
    let originalSharpsCount = 0;
    let firstChord = null;
    let lastChord = null;

    const addPitchClass = (pc, weight = 1, isRoot = true) => {
        pitchClassCounts.set(pc, (pitchClassCounts.get(pc) || 0) + weight);
        if (isRoot) {
            rootPitchClassSet.add(pc);
        }
    };

    const recordParsedChord = (parsed) => {
        if (!parsed) return;
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
        const cq = { rootPc: transposedRoot, isMinor: parsed.isMinor };
        chordQualities.push(cq);
        if (!firstChord) firstChord = cq;
        lastChord = cq;

        if (parsed.bassSemitone !== null) {
            const transposedBass = mod12(parsed.bassSemitone + semitones);
            addPitchClass(transposedBass, 1, false);
        }
    };

    const extracted =
        typeof customChordExtractor === 'function'
            ? customChordExtractor(lyrics)
            : extractCuratedChordsFromLyrics(lyrics);

    for (const parsed of extracted) {
        recordParsedChord(parsed);
    }

    let bestMajorTonic = 0;
    let bestScore = -Infinity;
    let secondBestScore = -Infinity;
    let totalPitchWeight = 0;
    for (const count of pitchClassCounts.values()) {
        totalPitchWeight += count;
    }
    let bestScaleCoverageWeight = 0;

    for (let tonic = 0; tonic < 12; tonic++) {
        const scaleSet = new Set(MAJOR_SCALE_INTERVALS.map((i) => mod12(tonic + i)));
        let score = 0;
        let inScaleWeight = 0;

        for (const [pc, count] of pitchClassCounts.entries()) {
            if (scaleSet.has(pc)) {
                score += count * 3;
                inScaleWeight += count;
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

        if (firstChord) {
            if (firstChord.rootPc === tonic && !firstChord.isMinor) score += 6;
            if (firstChord.rootPc === mod12(tonic + 9) && firstChord.isMinor) score += 6;
        }
        if (lastChord) {
            if (lastChord.rootPc === tonic && !lastChord.isMinor) score += 6;
            if (lastChord.rootPc === mod12(tonic + 9) && lastChord.isMinor) score += 6;
        }

        if (score > bestScore) {
            secondBestScore = bestScore;
            bestScore = score;
            bestMajorTonic = tonic;
            bestScaleCoverageWeight = inScaleWeight;
        } else if (score > secondBestScore) {
            secondBestScore = score;
        }
    }

    return {
        pitchClassCounts,
        rootPitchClassSet,
        chordQualities,
        originalFlatsCount,
        originalSharpsCount,
        firstChord,
        lastChord,
        bestMajorTonic,
        bestScore,
        secondBestScore,
        totalPitchWeight,
        bestScaleCoverageWeight,
        songKeyHint,
        semitones,
    };
}

export function deduceSongUseFlats(
    lyrics = '',
    semitones = 0,
    songKeyHint = null,
    customChordExtractor = null
) {
    const {
        pitchClassCounts,
        rootPitchClassSet,
        originalFlatsCount,
        originalSharpsCount,
        bestMajorTonic,
    } = analyzeSongHarmony(lyrics, semitones, songKeyHint, customChordExtractor);

    const hasBlackKeys = [...pitchClassCounts.keys()].some((pc) =>
        [1, 3, 6, 8, 10].includes(pc)
    );
    if (!hasBlackKeys) {
        return false;
    }

    // 1. If untransposed (semitones === 0), preserve the song's written accidental preference first
    if (mod12(semitones) === 0 && originalFlatsCount !== originalSharpsCount) {
        return originalFlatsCount > originalSharpsCount;
    }

    // 2. If one palette strictly reduces letter collisions (e.g. F & Bb vs A & A#), pick that palette
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

    // 3. When collisions are tied (e.g. 0 collisions in both A#m/G#/F# and Bbm/Ab/Gb),
    // only use flats for natural flat tonics (F, Bb, Eb) if they also contain natural chords;
    // if every single chord in the song is a black key (like A#m G# F# C#), bias toward Sharps!
    const allChordsAreBlackKeys = [...rootPitchClassSet].every((pc) =>
        [1, 3, 6, 8, 10].includes(pc)
    );
    if (allChordsAreBlackKeys) {
        return false;
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

    if (FLAT_TONICS.has(bestMajorTonic)) {
        return true;
    }
    if (SHARP_TONICS.has(bestMajorTonic)) {
        return false;
    }

    return false;
}

export function deduceSongKeyInfo(
    lyrics = '',
    semitones = 0,
    songKeyHint = null,
    customChordExtractor = null
) {
    const useFlats = deduceSongUseFlats(
        lyrics,
        semitones,
        songKeyHint,
        customChordExtractor
    );
    const palette = useFlats ? FLAT_NOTES : SHARP_NOTES;

    if (songKeyHint && typeof songKeyHint === 'string') {
        const parsedHint = parseChordToken(songKeyHint.trim());
        if (parsedHint) {
            const newRoot = palette[mod12(parsedHint.rootSemitone + semitones)];
            return {
                key: `${newRoot}${parsedHint.isMinor ? 'm' : ''}`,
                confidence: 100,
            };
        }
    }

    const {
        chordQualities,
        firstChord,
        lastChord,
        bestMajorTonic,
        bestScore,
        secondBestScore,
        totalPitchWeight,
        bestScaleCoverageWeight,
    } = analyzeSongHarmony(lyrics, semitones, null, customChordExtractor);

    if (chordQualities.length === 0) {
        return null;
    }

    const relMinorTonic = mod12(bestMajorTonic + 9);
    let majorWeight = 0;
    let minorWeight = 0;

    for (const cq of chordQualities) {
        if (cq.rootPc === bestMajorTonic && !cq.isMinor) majorWeight += 3;
        if (cq.rootPc === relMinorTonic && cq.isMinor) minorWeight += 3;
        if (cq.rootPc === mod12(relMinorTonic + 7) && !cq.isMinor) minorWeight += 2;
    }

    if (firstChord) {
        if (firstChord.rootPc === bestMajorTonic && !firstChord.isMinor) majorWeight += 5;
        if (firstChord.rootPc === relMinorTonic && firstChord.isMinor) minorWeight += 5;
    }
    if (lastChord) {
        if (lastChord.rootPc === bestMajorTonic && !lastChord.isMinor) majorWeight += 5;
        if (lastChord.rootPc === relMinorTonic && lastChord.isMinor) minorWeight += 5;
    }

    const isMinorWinner = minorWeight > majorWeight;
    const keyStr = isMinorWinner
        ? `${palette[relMinorTonic]}m`
        : palette[bestMajorTonic];

    const scaleCoverage =
        totalPitchWeight > 0 ? bestScaleCoverageWeight / totalPitchWeight : 0.7;
    const scoreMargin =
        bestScore > 0 ? Math.max(0, (bestScore - Math.max(0, secondBestScore)) / bestScore) : 0.25;
    const modeTotal = majorWeight + minorWeight;
    const modeClarity =
        modeTotal > 0 ? Math.abs(majorWeight - minorWeight) / modeTotal : 0.35;
    const sampleFactor = Math.min(1, chordQualities.length / 4);

    const rawConfidence =
        (scaleCoverage * 0.48 +
            Math.min(1, scoreMargin * 2.2) * 0.27 +
            modeClarity * 0.25) *
        (0.65 + 0.35 * sampleFactor);

    const confidence = Math.max(15, Math.min(99, Math.round(rawConfidence * 100)));

    return {
        key: keyStr,
        confidence,
    };
}

export function deduceSongKey(
    lyrics = '',
    semitones = 0,
    songKeyHint = null,
    customChordExtractor = null
) {
    const info = deduceSongKeyInfo(lyrics, semitones, songKeyHint, customChordExtractor);
    return info ? info.key : null;
}

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
    if (!isValidParenChordGroup(chordGroupInner)) {
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

    return String(contents || '').replace(/\(([^)]*)\)/g, (fullMatch, inner) => {
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
        if (!isValidParenChordGroup(inner)) {
            return fullMatch;
        }

        const currentUseFlats =
            deduceSongUseFlats(contents, songHalfTones, songKeyHint) ?? useFlats;
        return `(${transposeChordGroupInner(inner, songHalfTones, currentUseFlats)})`;
    });
}
