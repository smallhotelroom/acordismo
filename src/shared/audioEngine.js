/**
 * @file src/shared/audioEngine.js
 * @version 1.0.0
 * Zero-dependency polyphonic Web Audio engine for Acordismo:
 * - Supports 'natural' (warm acoustic string pluck / woodblock) and 'synth' (pure reference tone / digital click)
 * - Polyphonic voice architecture ready for future chord-strumming playback in SongScreen
 * - Hardware-clock lookahead scheduler for drift-free 4/4 Metronome (1/4, 1/8, 1/16)
 */

export const __version__ = '1.0.0';

export const GUITAR_STRINGS = [
    { id: 'g-6', label: '6E', note: 'E2', stringNum: 6, freq: 82.41 },
    { id: 'g-5', label: '5A', note: 'A2', stringNum: 5, freq: 110.0 },
    { id: 'g-4', label: '4D', note: 'D3', stringNum: 4, freq: 146.83 },
    { id: 'g-3', label: '3G', note: 'G3', stringNum: 3, freq: 196.0 },
    { id: 'g-2', label: '2B', note: 'B3', stringNum: 2, freq: 246.94 },
    { id: 'g-1', label: '1E', note: 'E4', stringNum: 1, freq: 329.63 },
];

export const UKULELE_STRINGS = [
    { id: 'u-4', label: '4G', note: 'G4', stringNum: 4, freq: 392.0 },
    { id: 'u-3', label: '3C', note: 'C4', stringNum: 3, freq: 261.63 },
    { id: 'u-2', label: '2E', note: 'E4', stringNum: 2, freq: 329.63 },
    { id: 'u-1', label: '1A', note: 'A4', stringNum: 1, freq: 440.0 },
];

let sharedAudioCtx = null;

export function getAudioContext() {
    if (!sharedAudioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
        sharedAudioCtx.resume();
    }
    return sharedAudioCtx;
}

/**
 * Plays a single musical pitch (polyphonic-ready: multiple calls layer cleanly).
 * @param {number} freq - Frequency in Hz
 * @param {object} options - { mode: 'natural' | 'synth', duration: seconds, startTimeOffset: seconds, gainScale: number }
 */
export function playNoteFrequency(
    freq,
    { mode = 'natural', duration = 3.2, startTimeOffset = 0, gainScale = 1.0 } = {}
) {
    const ctx = getAudioContext();
    const now = ctx.currentTime + startTimeOffset;

    const masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);

    if (mode === 'synth') {
        // Pure reference tone: fundamental sine + soft triangle octave warmth
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const osc2Gain = ctx.createGain();

        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(freq, now);

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(freq * 2, now);
        osc2Gain.gain.setValueAtTime(0.12, now);

        masterGain.gain.setValueAtTime(0.0001, now);
        masterGain.gain.linearRampToValueAtTime(0.32 * gainScale, now + 0.02);
        masterGain.gain.setValueAtTime(0.28 * gainScale, now + duration * 0.65);
        masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        osc1.connect(masterGain);
        osc2.connect(osc2Gain);
        osc2Gain.connect(masterGain);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + duration + 0.05);
        osc2.stop(now + duration + 0.05);

        return () => {
            try {
                const stopAt = ctx.currentTime;
                masterGain.gain.cancelScheduledValues(stopAt);
                masterGain.gain.setValueAtTime(masterGain.gain.value || 0.01, stopAt);
                masterGain.gain.exponentialRampToValueAtTime(0.0001, stopAt + 0.06);
                osc1.stop(stopAt + 0.07);
                osc2.stop(stopAt + 0.07);
            } catch {}
        };
    }

    // 'natural' mode: Plucked acoustic string synthesis (harmonics + lowpass pluck envelope)
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(7500, freq * 12), now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(400, freq * 2.2), now + duration * 0.85);
    filter.Q.setValueAtTime(1.2, now);
    filter.connect(masterGain);

    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.linearRampToValueAtTime(0.42 * gainScale, now + 0.008);
    masterGain.gain.exponentialRampToValueAtTime(0.14 * gainScale, now + 0.35);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    const harmonics = [
        { mult: 1, amp: 1.0, type: 'sawtooth' },
        { mult: 2, amp: 0.45, type: 'triangle' },
        { mult: 3, amp: 0.2, type: 'sine' },
        { mult: 4, amp: 0.08, type: 'sine' },
    ];

    const oscillators = harmonics.map((h) => {
        const osc = ctx.createOscillator();
        const hGain = ctx.createGain();
        osc.type = h.type;
        osc.frequency.setValueAtTime(freq * h.mult, now);
        hGain.gain.setValueAtTime(h.amp, now);
        osc.connect(hGain);
        hGain.connect(filter);
        osc.start(now);
        osc.stop(now + duration + 0.05);
        return osc;
    });

    return () => {
        try {
            const stopAt = ctx.currentTime;
            masterGain.gain.cancelScheduledValues(stopAt);
            masterGain.gain.setValueAtTime(masterGain.gain.value || 0.01, stopAt);
            masterGain.gain.exponentialRampToValueAtTime(0.0001, stopAt + 0.06);
            oscillators.forEach((o) => o.stop(stopAt + 0.07));
        } catch {}
    };
}

/**
 * Polyphonic helper for future SongScreen chord playback:
 * Strums an array of frequencies with a natural 22ms pick stagger across strings.
 */
export function playPolyphonicChord(frequencies = [], { mode = 'natural', duration = 2.4 } = {}) {
    const scale = Math.min(1, 1.4 / Math.max(1, frequencies.length));
    const stopFns = frequencies.map((freq, idx) =>
        playNoteFrequency(freq, {
            mode,
            duration,
            startTimeOffset: idx * 0.022,
            gainScale: scale,
        })
    );
    return () => stopFns.forEach((fn) => fn && fn());
}

/**
 * Schedules a single metronome click at hardware `time`.
 * @param {AudioContext} ctx
 * @param {number} time - Web Audio hardware timestamp
 * @param {'accent' | 'quarter' | 'sub'} beatType
 * @param {'natural' | 'synth'} mode
 */
export function scheduleMetronomeClick(ctx, time, beatType = 'quarter', mode = 'natural') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (mode === 'synth') {
        const freq =
            beatType === 'accent' ? 1320 : beatType === 'quarter' ? 880 : 660;
        const peakGain =
            beatType === 'accent' ? 0.38 : beatType === 'quarter' ? 0.26 : 0.12;
        const clickDur = beatType === 'sub' ? 0.025 : 0.04;

        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.linearRampToValueAtTime(peakGain, time + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + clickDur);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + clickDur + 0.005);
        return;
    }

    // 'natural' woodblock percussive click (pitch-drop sine + bandpass resonance)
    const startFreq =
        beatType === 'accent' ? 1150 : beatType === 'quarter' ? 840 : 620;
    const endFreq = startFreq * 0.52;
    const peakGain =
        beatType === 'accent' ? 0.65 : beatType === 'quarter' ? 0.45 : 0.2;
    const clickDur = beatType === 'sub' ? 0.032 : 0.048;

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + clickDur);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(peakGain, time + 0.0015);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + clickDur);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + clickDur + 0.005);
}
