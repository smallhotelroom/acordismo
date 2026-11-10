/**
 * @file src/shared/songChordPlayer.js
 * @version 1.0.0
 * Phase 1 Song Chord Sequencer for Acordismo:
 * - Parses curated `(A  Bm  D  A_D)` groups and standalone/crawler chord lines into a flat
 *   sequence of chord tokens (`seqIdx = 0, 1, 2...`) matching the exact order rendered in `songSheetRenderer.jsx`.
 * - Double-space (`  `) separates full bars (e.g. 4 quarter-note beats in 4/4).
 * - Underscore (`_`) subdivides a bar evenly across its quarter-note beats (e.g. `A_D` -> `A A D D`).
 * - Exclamation (`!`) triggers a 1-beat staccato strum followed by rests for the remainder of the bar.
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

export const __version__ = '1.0.0';

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
 * Every rendered chord span in `songSheetRenderer.jsx` receives a matching `seqIdx` (0..N-1).
 * Each item in the returned array is:
 * `{ seqIdx, lineIndex, displayedChord, beats, staccato }`
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

            // Walk the exact same token/delimiter stream as `songSheetRenderer.jsx`
            // so `seqIdx` stays 100% synchronized with every rendered chord span,
            // while grouping `_`-connected chords into shared bars!
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

            // Group chords into bar slots:
            // - A delimiter of `_` binds the next chord into the CURRENT bar slot (e.g. `A_D` shares 1 bar)
            // - A delimiter of `!` marks the preceding chord as staccato (`staccato = true`)
            // - Double-space `  ` (or other delimiters) starts a NEW bar slot
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

            // Assign exact beat counts inside each bar slot:
            // - Single chord in bar: `beatsPerBar` quarter-note strums (e.g. 4 strums in 4/4)
            // - Two chords `A_D` in 4/4: 2 strums of A, 2 strums of D
            // - Three chords `A_B_C` in 4/4: [2, 1, 1] strums so total bar length stays 4 beats
            for (const slot of barSlots) {
                const count = slot.length;
                if (count === 1) {
                    slot[0].beats = beatsPerBar;
                    sequence.push(slot[0]);
                } else {
                    const baseBeats = Math.max(1, Math.floor(beatsPerBar / count));
                    let remainder = Math.max(0, beatsPerBar - baseBeats * count);
                    for (let i = 0; i < count; i++) {
                        slot[i].beats = baseBeats + (remainder > 0 ? 1 : 0);
                        if (remainder > 0) remainder--;
                        sequence.push(slot[i]);
                    }
                }
            }
        }
    });

    return sequence;
}

/**
 * Plays a single quarter-note strum for `chordItem` using the song's exact concert-pitch voicing.
 */
export function strumSequenceChordItem(
    chordItem,
    {
        beatInChord = 0,
        instrument = 'guitar',
        customVoicings = null,
        songCapo = 0,
        songTuning = null,
        vocalTransposition = 0,
        visualOffset = 0,
        compensateCapo = false,
        fakeUkeEnabled = false,
        bpm = 120,
    } = {}
) {
    if (!chordItem) return;

    // If marked with `!` (staccato), only strum on the first beat of the chord and rest on remaining beats
    if (chordItem.staccato && beatInChord > 0) {
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

    if (!diagram || !Array.isArray(diagram.frequencies) || diagram.frequencies.length === 0) {
        return;
    }

    const beatDurationSec = 60 / Math.max(30, Number(bpm) || 120);
    // Let Beat 0 of each chord ring slightly fuller and louder than Beats 1, 2, 3
    const isFirstStrumOfChord = beatInChord === 0;
    const duration = chordItem.staccato
        ? Math.min(0.32, beatDurationSec * 0.55)
        : Math.min(2.0, beatDurationSec * (isFirstStrumOfChord ? 1.45 : 1.15));

    playPolyphonicChord(diagram.frequencies, {
        mode: 'natural',
        duration,
        strumSpreadSec: isFirstStrumOfChord ? 0.034 : 0.024,
    });
}
