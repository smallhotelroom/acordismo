/**
 * @file src/shared/songChordPlayer.js
 * @version 2.0.1
 * Phase 1 + Phase 2 Song Chord & 6-String Arpeggio Sequencer for Small Hotel Room:
 * - Parses curated `(A  Bm  D  A_D)` groups and standalone/crawler chord lines into a flat
 *   sequence of chord tokens (`seqIdx = 0, 1, 2...`) matching `songSheetRenderer.jsx`.
 * - Double-space (`  `) separates full bars; underscore (`_`) subdivides a bar evenly;
 *   exclamation (`!`) triggers a staccato hit on the first beat of the chord.
 * - Phase 2: Drives a 6-line (Guitar: 6E..1e) or 4-line (Ukulele: 4G..1A) Roll Editor
 *   where each line triggers that specific string of the active chord!
 */
import {
    CHORD_GROUP_DELIMITER_REGEX,
    DIRECTIVE_PAREN_REGEX,
    isValidParenChordGroup,
    parseChordToken,
    transposeChordToken,
} from './chordTransposer.js';
import {
    isCrawlerChordLine,
    isStandaloneChordLine,
    stripOuterPunctuation,
} from './crawlerTransposer.js';
import { getChordDiagramData } from './chordDiagrams.js';
import { playPolyphonicChord } from './audioEngine.js';

export const __version__ = '2.0.1';

export const GUITAR_ROLL_LABELS = ['6E', '5A', '4D', '3G', '2B', '1e'];
export const UKULELE_ROLL_LABELS = ['4G', '3C', '2E', '1A'];

export const STRUM_PRESETS = [
    { id: 'quarter', label: 'Quarter (1/4)', sub: 'Strum' },
    { id: 'campfire', label: 'Campfire (1/8)', sub: 'Groove' },
    { id: 'arpeggio8', label: 'Arpeggio (1/8)', sub: 'p-i-m-a' },
    { id: 'travis', label: 'Travis (1/8)', sub: 'Pick' },
    { id: 'triplet12', label: 'Triplet (1/3)', sub: '6/8 Roll' },
];

/**
 * Builds a 6-string (Guitar) or 4-string (Ukulele) roll matrix for a preset.
 * Row `0` is the lowest/thickest string (`6E` or `4G`); Row `N-1` is the highest string (`1e` or `1A`).
 */
export function buildStrumPresetTracks(presetId = 'quarter', instrument = 'guitar') {
    const isUke = instrument === 'ukulele';
    const labels = isUke ? UKULELE_ROLL_LABELS : GUITAR_ROLL_LABELS;
    const numStrings = labels.length;

    const makeEmptyTracks = (numSteps) =>
        labels.map((label, idx) => ({
            id: label,
            label,
            stringIdx: idx,
            steps: new Array(numSteps).fill(false),
        }));

    if (presetId === 'campfire') {
        // 8 steps (1/8 notes):
        // Step 0 (1):   Bass root (6E / 5A)
        // Step 2 (2):   Full Down-strum
        // Step 3 (2&):  Treble Up-strum
        // Step 5 (3&):  Treble Up-strum
        // Step 6 (4):   Full Down-strum
        // Step 7 (4&):  Treble Up-strum
        const tracks = makeEmptyTracks(8);
        for (let s = 0; s < numStrings; s++) {
            const isBass = isUke ? s === 0 : s <= 1;
            const isTreble = isUke ? s >= 1 : s >= 2;
            tracks[s].steps[0] = isBass;
            tracks[s].steps[2] = true;
            tracks[s].steps[3] = isTreble;
            tracks[s].steps[5] = isTreble;
            tracks[s].steps[6] = true;
            tracks[s].steps[7] = isTreble;
        }
        return { presetId, stepsPerBar: 8, tracks };
    }

    if (presetId === 'arpeggio8') {
        // 8 steps (1/8 notes): Classic p - i - m - a - e - a - m - i wave across strings
        const tracks = makeEmptyTracks(8);
        const pattern = isUke
            ? [0, 1, 2, 3, 2, 1, 2, 3]
            : [0, 2, 3, 4, 5, 4, 3, 2];
        pattern.forEach((strIdx, stepIdx) => {
            if (tracks[strIdx]) {
                tracks[strIdx].steps[stepIdx] = true;
            }
        });
        return { presetId, stepsPerBar: 8, tracks };
    }

    if (presetId === 'travis') {
        // 8 steps (1/8 notes): Alternating thumb bass + pinched/syncopated treble
        const tracks = makeEmptyTracks(8);
        if (isUke) {
            // 4-string uke Travis pattern
            const map = [[0, 3], [1], [0], [2], [0], [3], [1], [2]];
            map.forEach((strs, stepIdx) =>
                strs.forEach((s) => {
                    tracks[s].steps[stepIdx] = true;
                })
            );
        } else {
            // 6-string guitar Travis pattern:
            // Step 0: Bass 6E + High 1e pinch
            // Step 1: 3G
            // Step 2: Alt Bass 4D
            // Step 3: 2B
            // Step 4: Bass 6E
            // Step 5: 1e
            // Step 6: Alt Bass 4D
            // Step 7: 3G
            const map = [[0, 5], [3], [2], [4], [0], [5], [2], [3]];
            map.forEach((strs, stepIdx) =>
                strs.forEach((s) => {
                    tracks[s].steps[stepIdx] = true;
                })
            );
        }
        return { presetId, stepsPerBar: 8, tracks };
    }

    if (presetId === 'triplet12') {
        // 12 steps (1/3 triplet feel): Two 6-note arpeggio waves (Bass - 4D - 3G - 2B - 1e - 2B)
        const tracks = makeEmptyTracks(12);
        const wave = isUke
            ? [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1]
            : [0, 2, 3, 4, 5, 3, 0, 2, 3, 4, 5, 3];
        wave.forEach((strIdx, stepIdx) => {
            if (tracks[strIdx]) {
                tracks[strIdx].steps[stepIdx] = true;
            }
        });
        return { presetId, stepsPerBar: 12, tracks };
    }

    // Default 'quarter' (4 steps): All strings strummed on beats 1, 2, 3, 4
    const tracks = labels.map((label, idx) => ({
        id: label,
        label,
        stringIdx: idx,
        steps: [true, true, true, true],
    }));
    return { presetId: 'quarter', stepsPerBar: 4, tracks };
}

/**
 * Resizes an existing array of string tracks to a new `nextStepsPerBar` (1..32).
 */
export function resizeStrumTracks(tracks = [], nextStepsPerBar = 8) {
    const clamped = Math.max(1, Math.min(32, Math.round(Number(nextStepsPerBar) || 4)));
    return tracks.map((t) => {
        const nextSteps = [...t.steps];
        if (clamped < nextSteps.length) {
            return { ...t, steps: nextSteps.slice(0, clamped) };
        }
        while (nextSteps.length < clamped) {
            nextSteps.push(false);
        }
        return { ...t, steps: nextSteps };
    });
}

/**
 * Parses `time_signature` (e.g. "4/4", "3/4", "6/8") into quarter-note beats per bar.
 */
export function parseBeatsPerBar(rawTimeSignature) {
    if (!rawTimeSignature) return 4;
    const match = /^(\d+)\s*\/\s*(\d+)$/.exec(String(rawTimeSignature).trim());
    if (!match) return 4;
    const num = parseInt(match[1], 10);
    if (num >= 1 && num <= 16) {
        return num;
    }
    return 4;
}

/**
 * Extracts the ordered list of playable chord items from `displayedLyrics`.
 */
export function buildSongChordSequence({
    displayedLyrics = '',
    isCrawlerOrigin = false,
    visualOffset = 0,
    songUseFlats = false,
    beatsPerBar = 4,
}) {
    const sequence = [];
    let seqIdx = 0;
    const lines = String(displayedLyrics || '').split('\n');

    const appendCrawlerLineTokens = (lineText, lineIndex) => {
        const tokenRegex = /(\S+)|(\s+)/g;
        let match;
        while ((match = tokenRegex.exec(lineText)) !== null) {
            const [, rawWord] = match;
            if (!rawWord) continue;
            const { core } = stripOuterPunctuation(rawWord);
            if (core && parseChordToken(core) !== null) {
                const transposedChord = transposeChordToken(
                    core,
                    visualOffset,
                    songUseFlats
                );
                sequence.push({
                    seqIdx: seqIdx++,
                    lineIndex,
                    displayedChord: transposedChord,
                    beats: beatsPerBar,
                    startBeatInBar: 0,
                    staccato: false,
                });
            }
        }
    };

    lines.forEach((lineText, lineIndex) => {
        if (isCrawlerOrigin) {
            if (isCrawlerChordLine(lineText)) {
                appendCrawlerLineTokens(lineText, lineIndex);
            }
            return;
        }

        if (!lineText.includes('(') && isStandaloneChordLine(lineText)) {
            appendCrawlerLineTokens(lineText, lineIndex);
            return;
        }

        const re1 = /\((.+?)\)/g;
        let array1;
        while ((array1 = re1.exec(lineText)) !== null) {
            const chordGroup = array1[1];
            const isDirectiveGroup = DIRECTIVE_PAREN_REGEX.test(chordGroup);
            const isValidChords =
                !isDirectiveGroup && isValidParenChordGroup(chordGroup);

            if (!isValidChords) {
                continue;
            }

            const rawTokensAndDelims = [];
            let remaining = chordGroup;

            while (remaining.length > 0) {
                const delimiter = CHORD_GROUP_DELIMITER_REGEX.exec(remaining);
                if (delimiter !== null) {
                    const treatable = remaining.slice(0, delimiter.index);
                    const delimStr = delimiter[0];
                    remaining = remaining.slice(
                        delimiter.index + delimStr.length
                    );
                    if (delimiter.index > 0 && treatable.length > 0) {
                        rawTokensAndDelims.push({
                            type: 'chord',
                            raw: treatable,
                        });
                    }
                    rawTokensAndDelims.push({
                        type: 'delim',
                        raw: delimStr,
                    });
                } else {
                    rawTokensAndDelims.push({
                        type: 'chord',
                        raw: remaining,
                    });
                    break;
                }
            }

            const barSlots = [];
            let currentSlot = [];
            let joinNextToCurrentBar = false;

            for (const item of rawTokensAndDelims) {
                if (item.type === 'chord') {
                    const transposed = transposeChordToken(
                        item.raw,
                        visualOffset,
                        songUseFlats
                    );
                    const chordEntry = {
                        seqIdx: seqIdx++,
                        lineIndex,
                        displayedChord: transposed,
                        beats: beatsPerBar,
                        startBeatInBar: 0,
                        staccato: false,
                    };

                    if (joinNextToCurrentBar && currentSlot.length > 0) {
                        currentSlot.push(chordEntry);
                        joinNextToCurrentBar = false;
                    } else {
                        if (currentSlot.length > 0) {
                            barSlots.push(currentSlot);
                        }
                        currentSlot = [chordEntry];
                    }
                } else if (item.type === 'delim') {
                    if (item.raw === '_') {
                        joinNextToCurrentBar = true;
                    } else if (item.raw === '!') {
                        if (currentSlot.length > 0) {
                            currentSlot[currentSlot.length - 1].staccato = true;
                        }
                    } else if (item.raw === '  ') {
                        joinNextToCurrentBar = false;
                        if (currentSlot.length > 0) {
                            barSlots.push(currentSlot);
                            currentSlot = [];
                        }
                    }
                }
            }
            if (currentSlot.length > 0) {
                barSlots.push(currentSlot);
            }

            for (const slot of barSlots) {
                const count = slot.length;
                if (count === 1) {
                    slot[0].beats = beatsPerBar;
                    slot[0].startBeatInBar = 0;
                    sequence.push(slot[0]);
                } else {
                    const baseBeats = Math.max(1, Math.floor(beatsPerBar / count));
                    let remainder = Math.max(0, beatsPerBar - baseBeats * count);
                    let runningBeat = 0;
                    for (let i = 0; i < count; i++) {
                        const b = baseBeats + (remainder > 0 ? 1 : 0);
                        if (remainder > 0) remainder--;
                        slot[i].beats = b;
                        slot[i].startBeatInBar = runningBeat;
                        runningBeat += b;
                        sequence.push(slot[i]);
                    }
                }
            }
        }
    });

    return sequence;
}

/**
 * Triggers a single pattern step (`stepInBar`) on `chordItem` by checking which string rows
 * in `strumTracks` have an active dot at `stepInBar`.
 * Includes smart bass fallback: if string 0 (`6E`) is triggered by an arpeggio pattern
 * on a chord where `6E` is muted (such as `Am`, `C`, or `D`), it automatically plucks
 * the chord's lowest unmuted bass string (`5A` or `4D`)!
 */
export function triggerPatternStepOnChord(
    chordItem,
    {
        stepInBar = 0,
        stepInChord = 0,
        strumTracks = [],
        instrument = 'guitar',
        customVoicings = null,
        songCapo = 0,
        songTuning = null,
        vocalTransposition = 0,
        visualOffset = 0,
        compensateCapo = false,
        fakeUkeEnabled = false,
        bpm = 120,
        beatsPerBar = 4,
        soundMode = 'natural',
    } = {}
) {
    if (!chordItem || !Array.isArray(strumTracks) || strumTracks.length === 0) {
        return;
    }

    // If marked with `!` (staccato), only sound on the very first step of the chord
    if (chordItem.staccato && stepInChord > 0) {
        return;
    }

    const diagram = getChordDiagramData(
        chordItem.displayedChord,
        instrument,
        customVoicings,
        {
            songCapo,
            songTuning,
            vocalTransposition,
            visualOffset,
            compensateCapo,
            fakeUkeEnabled,
        }
    );

    if (!diagram || !Array.isArray(diagram.stringFrequencies)) {
        return;
    }

    const strFreqs = diagram.stringFrequencies;
    const lowestSoundedIdx = strFreqs.findIndex((f) => f !== null);
    if (lowestSoundedIdx === -1) return;

    const numSteps = Math.max(1, strumTracks[0]?.steps?.length || 4);
    const safeStepIdx = ((stepInBar % numSteps) + numSteps) % numSteps;

    // Collect which string indices are active on this column of the roll editor
    const triggeredFreqs = [];
    const usedStringIndices = new Set();

    strumTracks.forEach((track, sIdx) => {
        if (!track?.steps?.[safeStepIdx]) return;
        let targetIdx = sIdx;

        // Smart Bass Fallback: if a bass string (6E or 5A) is muted on this chord (e.g. C, Am, D),
        // route the thumb pluck to the chord's true root bass string (`lowestSoundedIdx`)
        if (targetIdx < lowestSoundedIdx) {
            targetIdx = lowestSoundedIdx;
        }

        if (
            targetIdx < strFreqs.length &&
            strFreqs[targetIdx] !== null &&
            !usedStringIndices.has(targetIdx)
        ) {
            usedStringIndices.add(targetIdx);
            triggeredFreqs.push(strFreqs[targetIdx]);
        }
    });

    if (triggeredFreqs.length === 0) {
        return;
    }

    const barDurationSec = (60 / Math.max(30, Number(bpm) || 120)) * beatsPerBar;
    const stepDurationSec = barDurationSec / numSteps;
    const isSinglePluck = triggeredFreqs.length <= 2;

    const duration = chordItem.staccato
        ? Math.min(0.3, stepDurationSec * 0.65)
        : isSinglePluck
          ? Math.min(1.6, Math.max(0.45, stepDurationSec * 2.4))
          : Math.min(1.9, Math.max(0.55, stepDurationSec * 1.55));

    playPolyphonicChord(triggeredFreqs, {
        mode: soundMode,
        duration,
        // Arpeggio / 2-note pinches sound simultaneously (8ms spread); full strums cascade (28ms spread)
        strumSpreadSec: triggeredFreqs.length === 1 ? 0 : isSinglePluck ? 0.008 : 0.026,
    });
}
