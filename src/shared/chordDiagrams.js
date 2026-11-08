/**
 * @file src/shared/chordDiagrams.js
 * @version 1.2.0
 * Guitar (6-string) and Ukulele (4-string) chord voicing generator for Acordismo.
 * - Supports song-specific `## Chords` / `## Fingerings` overrides and custom `tuning:`
 * - Separates visual diagram shapes from true concert-pitch Strum frequencies:
 *   Strum always sounds at (original song chord + song capo/drop + custom tuning + vocal transposition),
 *   even when 'Compensate Capo/Drop' or 'Fake Uke (-5)' visual helpers are enabled!
 */
import {
    parseChordToken,
    transposeChordToken,
} from '../../../smallhotelroom.github.io/src/shared/chordTransposer.js';
import {
    GUITAR_OPEN_MIDI,
    GUITAR_OPEN_PITCH_CLASSES,
    GUITAR_STRING_NAMES,
    UKULELE_OPEN_MIDI,
    UKULELE_OPEN_PITCH_CLASSES,
    UKULELE_STRING_NAMES,
    parseInstrumentTuning,
    suggestChordsForVoicing,
} from '../../../smallhotelroom.github.io/src/shared/songSchema.js';

export const __version__ = '1.2.0';

export { GUITAR_STRING_NAMES, UKULELE_STRING_NAMES };

export function normalizeQualityKey(rawQuality = '') {
    const q = String(rawQuality || '').trim();
    if (!q) return 'maj';

    const clean = q.replace(/^\(|\)$/g, '');
    if (clean === 'M' || clean.toLowerCase() === 'maj') return 'maj';
    if (clean === 'm' || clean.toLowerCase() === 'min' || clean === '-') return 'm';
    if (clean === 'M7' || /^maj7$/i.test(clean)) return 'maj7';
    if (/^m(in)?7$/i.test(clean) || clean === '-7') return 'm7';
    if (/^m(in)?(M7|maj7)$/i.test(clean)) return 'mmaj7';
    if (clean === '7' || /^dom7$/i.test(clean)) return '7';
    if (/^sus2$/i.test(clean)) return 'sus2';
    if (/^sus4?$/i.test(clean)) return 'sus4';
    if (/^(7sus4|7sus|9sus4)$/i.test(clean)) return '7sus4';
    if (/^(dim|o)$/i.test(clean)) return 'dim';
    if (/^(dim7|o7)$/i.test(clean)) return 'dim7';
    if (/^(m7b5|m7-5|ø)$/i.test(clean)) return 'm7b5';
    if (/^(aug|\+|\+5)$/i.test(clean)) return 'aug';
    if (/^(7#5|7\+5|7\+|aug7)$/i.test(clean)) return '7#5';
    if (/^(7b5|7-5)$/i.test(clean)) return '7b5';
    if (/^(7b9|7-9)$/i.test(clean)) return '7b9';
    if (clean === '6' || /^maj6$/i.test(clean)) return '6';
    if (/^m(in)?6$/i.test(clean)) return 'm6';
    if (/^(add9|add2|2)$/i.test(clean)) return 'add9';
    if (/^m(in)?(add9|add2)$/i.test(clean)) return 'madd9';
    if (clean === '9') return '9';
    if (/^m(in)?9$/i.test(clean)) return 'm9';
    if (/^(M9|maj9)$/i.test(clean)) return 'maj9';
    if (clean === '5') return '5';

    if (/^m(in)?(11|13)/i.test(clean)) return 'm7';
    if (/^(M|maj)(11|13)/i.test(clean)) return 'maj7';
    if (/^(11|13)/.test(clean)) return '7';
    if (clean.startsWith('m')) return 'm';
    return 'maj';
}

const UKULELE_SHAPES_BY_ROOT = {
    0: {
        maj: [0, 0, 0, 3],
        m: [0, 3, 3, 3],
        7: [0, 0, 0, 1],
        maj7: [0, 0, 0, 2],
        m7: [0, 3, 3, 3],
        mmaj7: [0, 3, 3, 2],
        sus2: [0, 2, 3, 3],
        sus4: [0, 0, 1, 3],
        '7sus4': [0, 0, 1, 1],
        dim: [2, 3, 2, 3],
        dim7: [2, 3, 2, 3],
        m7b5: [2, 3, 2, 1],
        aug: [1, 0, 0, 3],
        '7#5': [1, 0, 0, 1],
        '7b5': [3, 4, 2, 3],
        6: [0, 0, 0, 0],
        m6: [0, 3, 3, 0],
        add9: [0, 2, 0, 3],
        madd9: [0, 3, 3, 5],
        9: [0, 2, 0, 1],
        m9: [0, 3, 1, 1],
        maj9: [0, 2, 0, 2],
        5: [0, 0, 3, 3],
    },
    1: {
        maj: [1, 1, 1, 4],
        m: [1, 1, 0, 4],
        7: [1, 1, 1, 2],
        maj7: [1, 1, 1, 3],
        m7: [1, 4, 4, 4],
        mmaj7: [1, 4, 4, 3],
        sus2: [1, 3, 4, 4],
        sus4: [1, 1, 2, 4],
        '7sus4': [1, 1, 2, 2],
        dim: [0, 1, 0, 4],
        dim7: [0, 1, 0, 1],
        m7b5: [0, 1, 0, 2],
        aug: [2, 1, 1, 4],
        '7#5': [2, 1, 1, 2],
        6: [1, 1, 1, 1],
        m6: [1, 1, 0, 1],
        add9: [1, 3, 1, 4],
        9: [1, 3, 1, 2],
        m9: [1, 4, 2, 2],
        maj9: [1, 3, 1, 3],
        5: [1, 1, 4, 4],
    },
    2: {
        maj: [2, 2, 2, 0],
        m: [2, 2, 1, 0],
        7: [2, 2, 2, 3],
        maj7: [2, 2, 2, 4],
        m7: [2, 2, 1, 3],
        mmaj7: [2, 2, 1, 4],
        sus2: [2, 2, 0, 0],
        sus4: [0, 2, 3, 0],
        '7sus4': [2, 2, 3, 3],
        dim: [1, 2, 1, 0],
        dim7: [1, 2, 1, 2],
        m7b5: [1, 2, 1, 3],
        aug: [3, 2, 2, 1],
        '7#5': [3, 2, 2, 3],
        6: [2, 2, 2, 2],
        m6: [2, 2, 1, 2],
        add9: [2, 4, 2, 5],
        9: [2, 4, 2, 3],
        m9: [2, 5, 3, 3],
        maj9: [2, 4, 2, 4],
        5: [2, 2, 5, 5],
    },
    3: {
        maj: [0, 3, 3, 1],
        m: [3, 3, 2, 1],
        7: [3, 3, 3, 4],
        maj7: [3, 3, 3, 5],
        m7: [3, 3, 2, 4],
        mmaj7: [3, 3, 2, 5],
        sus2: [3, 3, 1, 1],
        sus4: [3, 3, 4, 1],
        '7sus4': [3, 3, 4, 4],
        dim: [2, 3, 2, 0],
        dim7: [2, 3, 2, 3],
        m7b5: [2, 3, 2, 4],
        aug: [0, 3, 3, 2],
        '7#5': [4, 3, 3, 4],
        6: [3, 3, 3, 3],
        m6: [3, 3, 2, 3],
        add9: [0, 3, 1, 1],
        9: [0, 1, 1, 1],
        m9: [3, 6, 4, 4],
        maj9: [0, 2, 1, 1],
        5: [3, 3, 6, 6],
    },
    4: {
        maj: [1, 4, 0, 2],
        m: [0, 4, 3, 2],
        7: [1, 2, 0, 2],
        maj7: [1, 3, 0, 2],
        m7: [0, 2, 0, 2],
        mmaj7: [0, 3, 0, 2],
        sus2: [4, 4, 2, 2],
        sus4: [2, 4, 0, 2],
        '7sus4': [2, 2, 0, 2],
        dim: [0, 4, 3, 1],
        dim7: [0, 1, 0, 1],
        m7b5: [0, 2, 0, 1],
        aug: [1, 0, 0, 3],
        '7#5': [1, 2, 0, 3],
        6: [4, 4, 4, 4],
        m6: [0, 1, 0, 2],
        add9: [1, 4, 2, 2],
        9: [1, 2, 2, 2],
        m9: [0, 2, 2, 2],
        maj9: [1, 3, 2, 2],
        5: [4, 4, 0, 2],
    },
    5: {
        maj: [2, 0, 1, 0],
        m: [1, 0, 1, 3],
        7: [2, 3, 1, 3],
        maj7: [2, 4, 1, 3],
        m7: [1, 3, 1, 3],
        mmaj7: [1, 4, 1, 3],
        sus2: [0, 0, 1, 3],
        sus4: [3, 0, 1, 1],
        '7sus4': [3, 3, 1, 3],
        dim: [1, 5, 4, 2],
        dim7: [1, 2, 1, 2],
        m7b5: [1, 3, 1, 2],
        aug: [2, 1, 1, 0],
        '7#5': [2, 3, 1, 4],
        6: [2, 2, 1, 3],
        m6: [1, 2, 1, 3],
        add9: [0, 0, 1, 0],
        9: [2, 3, 3, 3],
        m9: [1, 3, 3, 3],
        maj9: [0, 0, 0, 0],
        5: [5, 5, 1, 3],
    },
    6: {
        maj: [3, 1, 2, 1],
        m: [2, 1, 2, 0],
        7: [3, 4, 2, 4],
        maj7: [3, 5, 2, 4],
        m7: [2, 4, 2, 4],
        mmaj7: [2, 5, 2, 4],
        sus2: [1, 1, 2, 4],
        sus4: [4, 1, 2, 2],
        '7sus4': [4, 4, 2, 4],
        dim: [2, 0, 2, 0],
        dim7: [2, 3, 2, 3],
        m7b5: [2, 4, 2, 3],
        aug: [3, 2, 2, 1],
        '7#5': [3, 4, 2, 5],
        6: [3, 3, 2, 4],
        m6: [2, 3, 2, 4],
        add9: [1, 1, 2, 1],
        9: [1, 1, 0, 1],
        m9: [1, 1, 0, 0],
        maj9: [1, 1, 1, 1],
        5: [2, 1, 2, 4],
    },
    7: {
        maj: [0, 2, 3, 2],
        m: [0, 2, 3, 1],
        7: [0, 2, 1, 2],
        maj7: [0, 2, 2, 2],
        m7: [0, 2, 1, 1],
        mmaj7: [0, 2, 2, 1],
        sus2: [0, 2, 3, 0],
        sus4: [0, 2, 3, 3],
        '7sus4': [0, 2, 1, 3],
        dim: [0, 1, 3, 1],
        dim7: [0, 1, 0, 1],
        m7b5: [0, 1, 1, 1],
        aug: [0, 3, 3, 2],
        '7#5': [0, 3, 1, 2],
        6: [0, 2, 0, 2],
        m6: [0, 2, 0, 1],
        add9: [0, 2, 5, 2],
        9: [2, 2, 1, 2],
        m9: [2, 2, 1, 1],
        maj9: [2, 2, 2, 2],
        5: [0, 2, 3, 5],
    },
    8: {
        maj: [5, 3, 4, 3],
        m: [4, 3, 4, 2],
        7: [1, 3, 2, 3],
        maj7: [1, 3, 3, 3],
        m7: [1, 3, 2, 2],
        mmaj7: [1, 3, 3, 2],
        sus2: [1, 3, 4, 1],
        sus4: [1, 3, 4, 4],
        '7sus4': [1, 3, 2, 4],
        dim: [1, 2, 4, 2],
        dim7: [1, 2, 1, 2],
        m7b5: [1, 2, 2, 2],
        aug: [1, 0, 0, 3],
        '7#5': [1, 4, 2, 3],
        6: [1, 3, 1, 3],
        m6: [1, 3, 1, 2],
        add9: [3, 3, 4, 3],
        9: [3, 3, 2, 3],
        m9: [3, 3, 2, 2],
        maj9: [3, 3, 3, 3],
        5: [1, 3, 4, 6],
    },
    9: {
        maj: [2, 1, 0, 0],
        m: [2, 0, 0, 0],
        7: [0, 1, 0, 0],
        maj7: [1, 1, 0, 0],
        m7: [0, 0, 0, 0],
        mmaj7: [1, 0, 0, 0],
        sus2: [2, 4, 5, 2],
        sus4: [2, 2, 0, 0],
        '7sus4': [0, 2, 0, 0],
        dim: [2, 3, 5, 3],
        dim7: [2, 3, 2, 3],
        m7b5: [2, 3, 3, 3],
        aug: [2, 1, 1, 0],
        '7#5': [0, 1, 1, 0],
        6: [2, 4, 2, 4],
        m6: [2, 0, 2, 0],
        add9: [2, 1, 0, 2],
        9: [0, 1, 0, 2],
        m9: [2, 0, 0, 2],
        maj9: [1, 1, 0, 2],
        5: [2, 4, 0, 0],
    },
    10: {
        maj: [3, 2, 1, 1],
        m: [3, 1, 1, 1],
        7: [1, 2, 1, 1],
        maj7: [3, 2, 1, 0],
        m7: [1, 1, 1, 1],
        mmaj7: [2, 1, 1, 1],
        sus2: [3, 0, 1, 1],
        sus4: [3, 3, 1, 1],
        '7sus4': [1, 3, 1, 1],
        dim: [3, 1, 0, 1],
        dim7: [0, 1, 0, 1],
        m7b5: [1, 1, 0, 1],
        aug: [3, 2, 2, 1],
        '7#5': [1, 2, 2, 1],
        6: [0, 2, 1, 1],
        m6: [0, 1, 1, 1],
        add9: [3, 2, 1, 3],
        9: [1, 2, 1, 3],
        m9: [1, 1, 1, 3],
        maj9: [2, 2, 1, 3],
        5: [3, 5, 1, 1],
    },
    11: {
        maj: [4, 3, 2, 2],
        m: [4, 2, 2, 2],
        7: [2, 3, 2, 2],
        maj7: [4, 3, 2, 1],
        m7: [2, 2, 2, 2],
        mmaj7: [3, 2, 2, 2],
        sus2: [4, 1, 2, 2],
        sus4: [4, 4, 2, 2],
        '7sus4': [2, 4, 2, 2],
        dim: [4, 2, 1, 2],
        dim7: [1, 2, 1, 2],
        m7b5: [2, 2, 1, 2],
        aug: [0, 3, 3, 2],
        '7#5': [2, 3, 3, 2],
        6: [1, 3, 2, 2],
        m6: [1, 2, 2, 2],
        add9: [4, 3, 2, 4],
        9: [2, 3, 2, 4],
        m9: [2, 2, 2, 4],
        maj9: [3, 3, 2, 4],
        5: [4, 6, 2, 2],
    },
};

const GUITAR_OPEN_OVERRIDES = {
    '0:maj': [-1, 3, 2, 0, 1, 0],
    '0:7': [-1, 3, 2, 3, 1, 0],
    '0:maj7': [-1, 3, 2, 0, 0, 0],
    '0:add9': [-1, 3, 2, 0, 3, 0],
    '0:sus2': [-1, 3, 0, 0, 1, 3],
    '0:sus4': [-1, 3, 3, 0, 1, 1],
    '2:maj': [-1, -1, 0, 2, 3, 2],
    '2:m': [-1, -1, 0, 2, 3, 1],
    '2:7': [-1, -1, 0, 2, 1, 2],
    '2:maj7': [-1, -1, 0, 2, 2, 2],
    '2:m7': [-1, -1, 0, 2, 1, 1],
    '2:sus2': [-1, -1, 0, 2, 3, 0],
    '2:sus4': [-1, -1, 0, 2, 3, 3],
    '2:7sus4': [-1, -1, 0, 2, 1, 3],
    '2:6': [-1, -1, 0, 2, 0, 2],
    '2:m6': [-1, -1, 0, 2, 0, 1],
    '2:add9': [-1, -1, 0, 2, 3, 0],
    '4:maj': [0, 2, 2, 1, 0, 0],
    '4:m': [0, 2, 2, 0, 0, 0],
    '4:7': [0, 2, 0, 1, 0, 0],
    '4:maj7': [0, 2, 1, 1, 0, 0],
    '4:m7': [0, 2, 0, 0, 0, 0],
    '4:sus2': [0, 2, 4, 4, 0, 0],
    '4:sus4': [0, 2, 2, 2, 0, 0],
    '4:7sus4': [0, 2, 0, 2, 0, 0],
    '4:6': [0, 2, 2, 1, 2, 0],
    '4:m6': [0, 2, 2, 0, 2, 0],
    '4:add9': [0, 2, 4, 1, 0, 0],
    '5:maj7': [-1, -1, 3, 2, 1, 0],
    '7:maj': [3, 2, 0, 0, 0, 3],
    '7:7': [3, 2, 0, 0, 0, 1],
    '7:maj7': [3, 2, 0, 0, 0, 2],
    '7:sus2': [3, 0, 0, 0, 3, 3],
    '7:sus4': [3, 3, 0, 0, 1, 3],
    '7:6': [3, 2, 0, 0, 0, 0],
    '7:add9': [3, 0, 0, 2, 0, 3],
    '9:maj': [-1, 0, 2, 2, 2, 0],
    '9:m': [-1, 0, 2, 2, 1, 0],
    '9:7': [-1, 0, 2, 0, 2, 0],
    '9:maj7': [-1, 0, 2, 1, 2, 0],
    '9:m7': [-1, 0, 2, 0, 1, 0],
    '9:sus2': [-1, 0, 2, 2, 0, 0],
    '9:sus4': [-1, 0, 2, 2, 3, 0],
    '9:7sus4': [-1, 0, 2, 0, 3, 0],
    '9:6': [-1, 0, 2, 2, 2, 2],
    '9:m6': [-1, 0, 2, 2, 1, 2],
    '9:add9': [-1, 0, 2, 4, 2, 0],
    '11:7': [-1, 2, 1, 2, 0, 2],
};

const GUITAR_E_SHAPE_OFFSETS = {
    maj: [0, 2, 2, 1, 0, 0],
    m: [0, 2, 2, 0, 0, 0],
    7: [0, 2, 0, 1, 0, 0],
    maj7: [0, -1, 1, 1, 0, -1],
    m7: [0, 2, 0, 0, 0, 0],
    mmaj7: [0, 2, 1, 0, 0, 0],
    sus2: [0, 2, 4, 4, 0, 0],
    sus4: [0, 2, 2, 2, 0, 0],
    '7sus4': [0, 2, 0, 2, 0, 0],
    dim: [0, 1, 2, 0, -1, -1],
    dim7: [0, -1, -1, 0, -1, -1],
    m7b5: [0, -1, 0, 0, -1, -1],
    aug: [0, -1, 2, 1, 1, -1],
    '7#5': [0, -1, 0, 1, 1, -1],
    '7b5': [0, -1, 0, 1, -1, -1],
    6: [0, -1, -1, 1, 2, 0],
    m6: [0, -1, -1, 0, 2, 0],
    add9: [0, 2, 4, 1, 0, 0],
    9: [0, 2, 0, 1, 0, 2],
    m9: [0, 2, 0, 0, 0, 2],
    maj9: [0, 2, 1, 1, 0, 2],
    5: [0, 2, 2, -1, -1, -1],
};

const GUITAR_A_SHAPE_OFFSETS = {
    maj: [-1, 0, 2, 2, 2, 0],
    m: [-1, 0, 2, 2, 1, 0],
    7: [-1, 0, 2, 0, 2, 0],
    maj7: [-1, 0, 2, 1, 2, 0],
    m7: [-1, 0, 2, 0, 1, 0],
    mmaj7: [-1, 0, 2, 1, 1, 0],
    sus2: [-1, 0, 2, 2, 0, 0],
    sus4: [-1, 0, 2, 2, 3, 0],
    '7sus4': [-1, 0, 2, 0, 3, 0],
    dim: [-1, 0, 1, 2, 1, -1],
    dim7: [-1, 0, 1, -1, 1, -1],
    m7b5: [-1, 0, 1, 0, 1, -1],
    aug: [-1, 0, 3, 2, 2, 1],
    '7#5': [-1, 0, 2, 0, 2, 1],
    '7b5': [-1, 0, 1, 0, 2, -1],
    6: [-1, 0, 2, 2, 2, 2],
    m6: [-1, 0, 2, 2, 1, 2],
    add9: [-1, 0, 2, 4, 2, 0],
    9: [-1, 0, -1, 0, 0, 0],
    m9: [-1, 0, -2, 0, 0, -1],
    maj9: [-1, 0, -1, 1, 0, -1],
    5: [-1, 0, 2, 2, -1, -1],
};

function buildGuitarShape(rootSemitone, qKey) {
    const overrideKey = `${rootSemitone}:${qKey}`;
    if (GUITAR_OPEN_OVERRIDES[overrideKey]) {
        return [...GUITAR_OPEN_OVERRIDES[overrideKey]];
    }

    const fretOnE = (rootSemitone - 4 + 12) % 12;
    const fretOnA = (rootSemitone - 9 + 12) % 12;

    if (qKey === 'dim7') {
        if (fretOnA >= 1 && fretOnA <= 6) {
            return [-1, fretOnA, fretOnA + 1, fretOnA - 1, fretOnA + 1, -1];
        }
        const f = fretOnE === 0 ? 12 : fretOnE;
        return [f, -1, f - 1, f, f - 1, -1];
    }

    if (qKey === 'm7b5') {
        if (fretOnA >= 1 && fretOnA <= 7) {
            return [-1, fretOnA, fretOnA + 1, fretOnA, fretOnA + 1, -1];
        }
        return [fretOnE, -1, fretOnE, fretOnE, fretOnE - 1, -1];
    }

    if (qKey === '9' && fretOnA >= 2 && fretOnA <= 8) {
        return [-1, fretOnA, fretOnA - 1, fretOnA, fretOnA, fretOnA];
    }

    if (qKey === 'm9' && fretOnA >= 2 && fretOnA <= 8) {
        return [-1, fretOnA, fretOnA - 2, fretOnA, fretOnA, -1];
    }

    const useAShape =
        fretOnA > 0 && fretOnA <= 5 && (fretOnE === 0 || fretOnA < fretOnE);

    if (useAShape && GUITAR_A_SHAPE_OFFSETS[qKey]) {
        return GUITAR_A_SHAPE_OFFSETS[qKey].map((off) =>
            off === -1 ? -1 : fretOnA + off
        );
    }

    const offsets = GUITAR_E_SHAPE_OFFSETS[qKey] || GUITAR_E_SHAPE_OFFSETS.maj;
    return offsets.map((off) => (off === -1 ? -1 : fretOnE + off));
}

function applySlashBassToVoicing(frets, bassSemitone, instrument, openPcs) {
    if (bassSemitone === null || bassSemitone === undefined) {
        return frets;
    }
    const nextFrets = [...frets];
    const pcs =
        openPcs ||
        (instrument === 'ukulele' ? UKULELE_OPEN_PITCH_CLASSES : GUITAR_OPEN_PITCH_CLASSES);

    if (instrument === 'guitar') {
        const activeFrets = nextFrets.filter((f) => f > 0);
        const minFret = activeFrets.length > 0 ? Math.min(...activeFrets) : 1;
        const maxFret = activeFrets.length > 0 ? Math.max(...activeFrets) : 4;

        const fretOn6 = (bassSemitone - pcs[0] + 12) % 12;
        const fretOn5 = (bassSemitone - pcs[1] + 12) % 12;
        const fretOn4 = (bassSemitone - pcs[2] + 12) % 12;

        if (fretOn6 === 0 || (fretOn6 >= minFret - 2 && fretOn6 <= maxFret + 1 && fretOn6 <= 5)) {
            nextFrets[0] = fretOn6;
            return nextFrets;
        }
        if (fretOn5 === 0 || (fretOn5 >= minFret - 2 && fretOn5 <= maxFret + 1 && fretOn5 <= 5)) {
            nextFrets[0] = -1;
            nextFrets[1] = fretOn5;
            return nextFrets;
        }
        if (fretOn4 === 0 && nextFrets[0] === -1 && nextFrets[1] === -1) {
            nextFrets[2] = 0;
            return nextFrets;
        }
    }
    return nextFrets;
}

function analyzeFretWindow(frets) {
    const positiveFrets = frets.filter((f) => f > 0);
    if (positiveFrets.length === 0) {
        return { baseFret: 1, barre: null };
    }

    const minFret = Math.min(...positiveFrets);
    const maxFret = Math.max(...positiveFrets);
    const baseFret = maxFret <= 4 ? 1 : minFret;

    let barre = null;
    if (minFret >= 1) {
        const indicesAtMin = [];
        frets.forEach((f, idx) => {
            if (f === minFret) indicesAtMin.push(idx);
        });
        if (indicesAtMin.length >= 2) {
            const firstIdx = indicesAtMin[0];
            const lastIdx = indicesAtMin[indicesAtMin.length - 1];
            const hasLowerOrMutedInside = frets
                .slice(firstIdx, lastIdx + 1)
                .some((f) => f >= 0 && f < minFret);
            if (!hasLowerOrMutedInside) {
                barre = {
                    fret: minFret,
                    fromString: firstIdx,
                    toString: lastIdx,
                };
            }
        }
    }

    return { baseFret, barre };
}

function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Computes the exact frequencies (in Hz) for each sounded string in a voicing,
 * applying both the instrument's open-string MIDI pitches (standard or custom tuning)
 * and any global pitch shift (`pitchShiftSemitones` = songCapo + vocalTransposition).
 */
export function getVoicingFrequencies(
    frets,
    instrument = 'guitar',
    { openMidis = null, pitchShiftSemitones = 0 } = {}
) {
    const baseMidis =
        openMidis ||
        (instrument === 'ukulele' ? UKULELE_OPEN_MIDI : GUITAR_OPEN_MIDI);
    const freqs = [];
    for (let i = 0; i < frets.length; i++) {
        const f = frets[i];
        if (f >= 0) {
            freqs.push(midiToFreq(baseMidis[i] + f + pitchShiftSemitones));
        }
    }
    return freqs;
}

function resolveStandardFretsForChord(chordStr, instrument = 'guitar') {
    const parsed = parseChordToken(String(chordStr || '').trim());
    if (!parsed) return null;
    const qKey = normalizeQualityKey(parsed.quality);
    let frets =
        instrument === 'ukulele'
            ? [
                  ...((
                      UKULELE_SHAPES_BY_ROOT[parsed.rootSemitone] ||
                      UKULELE_SHAPES_BY_ROOT[0]
                  )[qKey] || UKULELE_SHAPES_BY_ROOT[parsed.rootSemitone].maj),
              ]
            : buildGuitarShape(parsed.rootSemitone, qKey);
    if (parsed.bassSemitone !== null) {
        frets = applySlashBassToVoicing(frets, parsed.bassSemitone, instrument);
    }
    return frets;
}

/**
 * Resolves any chord string into a complete diagram descriptor AND exact concert-pitch Strum frequencies.
 *
 * @param {string} chordStr - The displayed chord token (e.g. "Em7" or "F#m7")
 * @param {'guitar'|'ukulele'} instrument
 * @param {object} customVoicings - Song's custom voicings map
 * @param {object} context - {
 *   songCapo: number (positive for capo, negative for drop),
 *   songTuning: string|null (e.g. "D A C F A E" or "-2 0 -2 -2 -2 0"),
 *   vocalTransposition: number (Setting 3: actual vocal key change),
 *   visualOffset: number (total shift applied to displayed chord names),
 *   compensateCapo: boolean (Setting 1),
 *   fakeUkeEnabled: boolean (Setting 2)
 * }
 */
export function getChordDiagramData(
    chordStr,
    instrument = 'guitar',
    customVoicings = null,
    {
        songCapo = 0,
        songTuning = null,
        vocalTransposition = 0,
        visualOffset = 0,
        compensateCapo = false,
        fakeUkeEnabled = false,
    } = {}
) {
    const cleanChord = String(chordStr || '').trim();
    const parsed = parseChordToken(cleanChord);
    if (!parsed) {
        return null;
    }

    const customEntry = customVoicings?.[instrument]?.[cleanChord] || null;
    let frets;
    let customLabel = null;
    let isSongSpecific = false;

    // If the user enabled 'Compensate Capo/Drop' (and not Fake Uke), they are playing on a standard-tuned,
    // un-capoed instrument; otherwise, diagram string labels reflect the song's custom tuning (if any).
    const useCustomTuningForDiagram =
        instrument === 'guitar' && Boolean(songTuning) && !compensateCapo && !fakeUkeEnabled;
    const diagramTuning = parseInstrumentTuning(
        useCustomTuningForDiagram ? songTuning : null,
        instrument
    );

    if (customEntry && Array.isArray(customEntry.frets)) {
        frets = [...customEntry.frets];
        customLabel = customEntry.label || 'Song-specific posture';
        isSongSpecific = true;
    } else {
        frets = resolveStandardFretsForChord(cleanChord, instrument);
        if (!frets) return null;
    }

    const { baseFret, barre } = analyzeFretWindow(frets);

    // --- CONCERT-PITCH STRUM SOUND CALCULATION ---
    // Rule: Settings 1 (Compensate Capo/Drop) and 2 (Fake Uke -5) NEVER change the Strum sound!
    // Only the song's original capo/drop + original tuning + Setting 3 (vocalTransposition) determine the sound.
    const soundShiftFromCapoAndVocal = Number(songCapo || 0) + Number(vocalTransposition || 0);
    const soundTuning = parseInstrumentTuning(
        instrument === 'guitar' ? songTuning : null,
        instrument
    );

    let soundFrets = frets;
    let soundPitchShift = soundShiftFromCapoAndVocal;

    if (customEntry && Array.isArray(customEntry.originalFrets)) {
        // Play the song's exact original custom posture on the song's original tuning + capo + vocalTransposition
        soundFrets = customEntry.originalFrets;
        soundPitchShift = soundShiftFromCapoAndVocal;
    } else if (visualOffset !== vocalTransposition) {
        // Reconstruct the un-compensated chord (written chord + vocalTransposition) so Strum plays at true concert pitch
        const helperShift = visualOffset - vocalTransposition; // e.g. +capo - 5
        const concertWrittenChord = transposeChordToken(cleanChord, -helperShift, false);
        const uncompensatedFrets = resolveStandardFretsForChord(
            concertWrittenChord,
            instrument
        );
        if (uncompensatedFrets) {
            soundFrets = uncompensatedFrets;
            soundPitchShift = soundShiftFromCapoAndVocal;
        }
    }

    const frequencies = getVoicingFrequencies(soundFrets, instrument, {
        openMidis: soundTuning.openMidis,
        pitchShiftSemitones: soundPitchShift,
    });

    // Identify the actual sounding concert chord name (e.g. when capo, drop, or custom tuning shifts the pitch)
    const concertMatches = suggestChordsForVoicing(soundFrets, instrument, {
        maxResults: 1,
        customTuningStr: instrument === 'guitar' ? songTuning : null,
        pitchShiftSemitones: soundPitchShift,
    });
    const concertSoundName = concertMatches.length > 0 ? concertMatches[0].chord : null;

    return {
        chordName: cleanChord,
        instrument,
        frets,
        baseFret,
        barre,
        stringNames: diagramTuning.stringNames,
        isCustomTuning: diagramTuning.isCustom,
        tuningDisplay: diagramTuning.displayStr,
        frequencies,
        isSongSpecific,
        customLabel,
        concertSoundName,
    };
}
