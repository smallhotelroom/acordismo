/**
 * @file src/shared/audioEngine.js
 * @version 2.4.0
 * Web Audio API synthesis engine for Acordismo:
 * - Tuner reference string definitions (`GUITAR_STRINGS`, `UKULELE_STRINGS`) & `playNoteFrequency`
 * - Polyphonic guitar/ukulele chord strumming & Reference pitch generator
 * - Multi-track Polyrhythm Metronome scheduler with quick 4/4 presets:
 *   - 1 (1/4 Quarter):   1 track  (4 steps)  -> AAAA
 *   - 2 (1/8 Eighth):    2 tracks (8 steps)  -> ABABABAB
 *   - 3 (1/3 Triplet):   2 tracks (12 steps) -> ABBABBABBABB
 *   - 4 (1/16 Sixteenth): 2 tracks (16 steps) -> ABBBABBBABBBABBB
 * - Full per-track step-count editing (1..16 steps per track), voice cycling ('high'|'mid'|'low'),
 *   and up to 4 simultaneous polyrhythm tracks (A, B, C, D).
 */
import { APP_DEFAULTS } from './AppContext';

export const __version__ = '2.4.0';

let audioCtx = null;

function getAudioContext() {
    if (!audioCtx && typeof window !== 'undefined') {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            audioCtx = new AudioContextClass();
        }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }
    return audioCtx;
}

// --- TUNER STRING CONSTANTS ---
export const GUITAR_STRINGS = [
    { string: 6, note: 'E2', label: '6E', freq: 82.41, midi: 40 },
    { string: 5, note: 'A2', label: '5A', freq: 110.0, midi: 45 },
    { string: 4, note: 'D3', label: '4D', freq: 146.83, midi: 50 },
    { string: 3, note: 'G3', label: '3G', freq: 196.0, midi: 55 },
    { string: 2, note: 'B3', label: '2B', freq: 246.94, midi: 59 },
    { string: 1, note: 'E4', label: '1e', freq: 329.63, midi: 64 },
];

export const UKULELE_STRINGS = [
    { string: 4, note: 'G4', label: '4G', freq: 392.0, midi: 67 },
    { string: 3, note: 'C4', label: '3C', freq: 261.63, midi: 60 },
    { string: 2, note: 'E4', label: '2E', freq: 329.63, midi: 64 },
    { string: 1, note: 'A4', label: '1A', freq: 440.0, midi: 69 },
];

const TRACK_LABELS = ['A', 'B', 'C', 'D'];
const VOICE_ORDER = ['high', 'low', 'mid'];

/**
 * Builds the default multi-track roll pattern for the quick 4/4 subdivision buttons:
 * - 1 (1/4):  1 track of 4 steps (AAAA)
 * - 2 (1/8):  2 tracks of 8 steps (ABABABAB)
 * - 3 (1/3):  2 tracks of 12 steps (ABBABBABBABB)
 * - 4 (1/16): 2 tracks of 16 steps (ABBBABBBABBBABBB)
 */
export function buildQuick44Tracks(subdivision = 1) {
    const sub = Number(subdivision) || 1;
    if (sub <= 1) {
        return [
            {
                id: 'A',
                label: 'A',
                voice: 'high',
                steps: [true, true, true, true],
            },
        ];
    }

    const totalSteps = 4 * sub; // 8 for 1/8, 12 for 1/3, 16 for 1/16
    const topSteps = [];
    const bottomSteps = [];

    for (let i = 0; i < totalSteps; i++) {
        const isMainBeat = i % sub === 0;
        topSteps.push(isMainBeat);
        bottomSteps.push(!isMainBeat);
    }

    return [
        {
            id: 'A',
            label: 'A',
            voice: 'high',
            steps: topSteps,
        },
        {
            id: 'B',
            label: 'B',
            voice: 'low',
            steps: bottomSteps,
        },
    ];
}

// --- METRONOME STATE & SUBSCRIPTION STORE ---
const BPM_STORAGE_KEY = 'acordismo_metronome_bpm';
const SUBDIV_STORAGE_KEY = 'acordismo_metronome_subdiv';
const SOUND_STORAGE_KEY = 'acordismo_metronome_sound';
const PERSIST_STORAGE_KEY = 'acordismo_metronome_persistent';

function loadInitialSubdivision() {
    if (typeof localStorage !== 'undefined') {
        const saved = parseInt(localStorage.getItem(SUBDIV_STORAGE_KEY), 10);
        if ([1, 2, 3, 4].includes(saved)) return saved;
    }
    return APP_DEFAULTS?.default_metronome_subdivision || 1;
}

const initialSubdiv = loadInitialSubdivision();

const metronomeState = {
    isPlaying: false,
    bpm: (() => {
        if (typeof localStorage !== 'undefined') {
            const saved = parseInt(localStorage.getItem(BPM_STORAGE_KEY), 10);
            if (!Number.isNaN(saved) && saved >= 30 && saved <= 260) return saved;
        }
        return APP_DEFAULTS?.default_metronome_bpm || 120;
    })(),
    subdivision: initialSubdiv, // 1 = 1/4, 2 = 1/8, 3 = 1/3, 4 = 1/16, 0 = Custom roll
    soundMode: (() => {
        if (typeof localStorage !== 'undefined') {
            const saved = localStorage.getItem(SOUND_STORAGE_KEY);
            if (saved === 'natural' || saved === 'synth') return saved;
        }
        return APP_DEFAULTS?.default_metronome_sound || 'natural';
    })(),
    persistent: (() => {
        if (typeof localStorage !== 'undefined') {
            const saved = localStorage.getItem(PERSIST_STORAGE_KEY);
            if (saved !== null) return saved === 'true';
        }
        return APP_DEFAULTS?.default_metronome_persistent ?? true;
    })(),
    tracks: buildQuick44Tracks(initialSubdiv),
    currentStepByTrack: buildQuick44Tracks(initialSubdiv).map(() => -1),
    currentBeat: -1,
};

const listeners = new Set();

function notifyListeners() {
    const snapshot = {
        ...metronomeState,
        tracks: metronomeState.tracks.map((t) => ({
            ...t,
            steps: [...t.steps],
        })),
        currentStepByTrack: [...metronomeState.currentStepByTrack],
    };
    listeners.forEach((fn) => fn(snapshot));
}

export function getMetronomeState() {
    return {
        ...metronomeState,
        tracks: metronomeState.tracks.map((t) => ({
            ...t,
            steps: [...t.steps],
        })),
        currentStepByTrack: [...metronomeState.currentStepByTrack],
    };
}

export function subscribeMetronomeState(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/**
 * Schedules a single metronome click sound at `time` (in AudioContext seconds).
 * `voice`: 'high' (Track A), 'mid' (Track C), or 'low' (Track B).
 */
function scheduleMetronomeClickAt(ctx, time, voice = 'high', soundMode = 'natural') {
    const isHigh = voice === 'high';
    const isMid = voice === 'mid';

    if (soundMode === 'synth') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const freq = isHigh ? 1046.5 : isMid ? 830.61 : 659.25; // C6 / G#5 / E5
        const peakGain = isHigh ? 0.34 : isMid ? 0.26 : 0.2;
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.linearRampToValueAtTime(peakGain, time + 0.003);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.055);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + 0.06);
        return;
    }

    // 'natural' woodblock / rimshot click
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const startFreq = isHigh ? 1320 : isMid ? 1060 : 840;
    const endFreq = isHigh ? 520 : isMid ? 430 : 340;
    const peakGain = isHigh ? 0.42 : isMid ? 0.32 : 0.24;
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + 0.028);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(peakGain, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.042);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.048);
}

// --- LOOKAHEAD SCHEDULER (Supports N tracks with independent step counts) ---
let schedulerTimerId = null;
let nextTrackStepTimes = [];
let nextTrackStepIndices = [];
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_SEC = 0.1;

function resetSchedulerCursors(ctx) {
    const now = ctx ? ctx.currentTime + 0.03 : 0;
    nextTrackStepTimes = metronomeState.tracks.map(() => now);
    nextTrackStepIndices = metronomeState.tracks.map(() => 0);
}

function runSchedulerTick() {
    if (!metronomeState.isPlaying) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    // 1 bar in 4/4 = 4 quarter-note beats
    const barDurationSec = (60 / Math.max(30, metronomeState.bpm)) * 4;

    for (let tIdx = 0; tIdx < metronomeState.tracks.length; tIdx++) {
        const track = metronomeState.tracks[tIdx];
        const numSteps = Math.max(1, track.steps.length);
        const stepDurationSec = barDurationSec / numSteps;

        while (nextTrackStepTimes[tIdx] < ctx.currentTime + SCHEDULE_AHEAD_SEC) {
            const stepIndex = nextTrackStepIndices[tIdx] % numSteps;
            const stepTime = nextTrackStepTimes[tIdx];
            const isActive = Boolean(track.steps[stepIndex]);

            if (isActive) {
                scheduleMetronomeClickAt(
                    ctx,
                    stepTime,
                    track.voice || (tIdx === 0 ? 'high' : 'low'),
                    metronomeState.soundMode
                );
            }

            const delayMs = Math.max(0, (stepTime - ctx.currentTime) * 1000);
            const capturedTrackIdx = tIdx;
            const capturedStepIdx = stepIndex;

            setTimeout(() => {
                if (!metronomeState.isPlaying) return;
                if (
                    metronomeState.currentStepByTrack[capturedTrackIdx] !==
                    capturedStepIdx
                ) {
                    metronomeState.currentStepByTrack[capturedTrackIdx] =
                        capturedStepIdx;
                    if (capturedTrackIdx === 0) {
                        metronomeState.currentBeat = Math.floor(
                            (capturedStepIdx / numSteps) * 4
                        );
                    }
                    notifyListeners();
                }
            }, delayMs);

            nextTrackStepTimes[tIdx] += stepDurationSec;
            nextTrackStepIndices[tIdx] = (stepIndex + 1) % numSteps;
        }
    }
}

export function setMetronomePlaying(shouldPlay) {
    const nextPlay = Boolean(shouldPlay);
    if (nextPlay === metronomeState.isPlaying) return;

    if (nextPlay) {
        const ctx = getAudioContext();
        if (!ctx) return;
        metronomeState.isPlaying = true;
        metronomeState.currentStepByTrack = metronomeState.tracks.map(() => 0);
        metronomeState.currentBeat = 0;
        resetSchedulerCursors(ctx);
        runSchedulerTick();
        schedulerTimerId = setInterval(runSchedulerTick, LOOKAHEAD_MS);
    } else {
        metronomeState.isPlaying = false;
        metronomeState.currentStepByTrack = metronomeState.tracks.map(() => -1);
        metronomeState.currentBeat = -1;
        if (schedulerTimerId) {
            clearInterval(schedulerTimerId);
            schedulerTimerId = null;
        }
    }
    notifyListeners();
}

export function setMetronomeBpm(nextBpm) {
    const clamped = Math.max(30, Math.min(260, Math.round(Number(nextBpm) || 120)));
    metronomeState.bpm = clamped;
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem(BPM_STORAGE_KEY, String(clamped));
    }
    notifyListeners();
}

export function setMetronomeSubdivision(nextSubdiv) {
    const valid = [1, 2, 3, 4].includes(Number(nextSubdiv)) ? Number(nextSubdiv) : 1;
    metronomeState.subdivision = valid;
    metronomeState.tracks = buildQuick44Tracks(valid);
    metronomeState.currentStepByTrack = metronomeState.tracks.map(() =>
        metronomeState.isPlaying ? 0 : -1
    );
    if (metronomeState.isPlaying && audioCtx) {
        resetSchedulerCursors(audioCtx);
    }
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SUBDIV_STORAGE_KEY, String(valid));
    }
    notifyListeners();
}

/**
 * Toggles a single dot inside the roll editor (Track `trackIdx`, column `stepIdx`).
 */
export function toggleMetronomeTrackStep(trackIdx, stepIdx) {
    const track = metronomeState.tracks[trackIdx];
    if (!track || stepIdx < 0 || stepIdx >= track.steps.length) return;
    track.steps[stepIdx] = !track.steps[stepIdx];
    metronomeState.subdivision = 0; // Mark as custom pattern
    notifyListeners();
}

/**
 * Changes the number of steps (1..16) on a single track independently (for polyrhythms like 3 against 4).
 */
export function setMetronomeTrackStepCount(trackIdx, nextCount) {
    const track = metronomeState.tracks[trackIdx];
    if (!track) return;
    const clamped = Math.max(1, Math.min(16, Math.round(Number(nextCount) || 4)));
    if (clamped === track.steps.length) return;

    if (clamped < track.steps.length) {
        track.steps = track.steps.slice(0, clamped);
    } else {
        while (track.steps.length < clamped) {
            track.steps.push(true);
        }
    }
    metronomeState.subdivision = 0;
    if (metronomeState.isPlaying && audioCtx) {
        resetSchedulerCursors(audioCtx);
    }
    notifyListeners();
}

/**
 * Cycles a track's click pitch voice ('high' -> 'low' -> 'mid') when the user taps its left A/B/C badge.
 */
export function cycleMetronomeTrackVoice(trackIdx) {
    const track = metronomeState.tracks[trackIdx];
    if (!track) return;
    const currIdx = VOICE_ORDER.indexOf(track.voice || 'high');
    track.voice = VOICE_ORDER[(currIdx + 1) % VOICE_ORDER.length];
    notifyListeners();
}

/**
 * Appends a new polyrhythm track line (up to 4 tracks: A, B, C, D).
 */
export function addMetronomeTrack() {
    if (metronomeState.tracks.length >= 4) return;
    const nextIdx = metronomeState.tracks.length;
    const label = TRACK_LABELS[nextIdx] || String.fromCharCode(65 + nextIdx);
    const defaultVoice = nextIdx === 0 ? 'high' : nextIdx === 1 ? 'low' : 'mid';
    const firstLen = metronomeState.tracks[0]?.steps.length || 4;
    const defaultStepsCount = firstLen === 4 && nextIdx >= 1 ? 3 : 4;

    metronomeState.tracks.push({
        id: label,
        label,
        voice: defaultVoice,
        steps: new Array(defaultStepsCount).fill(true),
    });
    metronomeState.currentStepByTrack.push(metronomeState.isPlaying ? 0 : -1);
    metronomeState.subdivision = 0;
    if (metronomeState.isPlaying && audioCtx) {
        resetSchedulerCursors(audioCtx);
    }
    notifyListeners();
}

/**
 * Removes the bottom-most track line (down to 1 track).
 */
export function removeLastMetronomeTrack() {
    if (metronomeState.tracks.length <= 1) return;
    metronomeState.tracks.pop();
    metronomeState.currentStepByTrack.pop();
    metronomeState.subdivision = 0;
    if (metronomeState.isPlaying && audioCtx) {
        resetSchedulerCursors(audioCtx);
    }
    notifyListeners();
}

export function setMetronomeSoundMode(nextMode) {
    const valid = nextMode === 'synth' ? 'synth' : 'natural';
    metronomeState.soundMode = valid;
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SOUND_STORAGE_KEY, valid);
    }
    notifyListeners();
}

export function setMetronomePersistent(nextPersist) {
    const boolVal = Boolean(nextPersist);
    metronomeState.persistent = boolVal;
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem(PERSIST_STORAGE_KEY, String(boolVal));
    }
    notifyListeners();
}

// --- POLYPHONIC CHORD STRUM & REFERENCE PITCH GENERATOR ---
export function playReferenceNote(
    freqHz,
    { mode = 'natural', duration = 1.6, startTimeOffset = 0, gainScale = 0.28 } = {}
) {
    const ctx = getAudioContext();
    if (!ctx || !freqHz) return;

    const now = ctx.currentTime + Math.max(0, startTimeOffset);
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    if (mode === 'synth') {
        osc1.type = 'sawtooth';
        osc2.type = 'triangle';
        osc2.detune.setValueAtTime(4, now);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(freqHz * 4, now);
    } else {
        osc1.type = 'triangle';
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(freqHz * 2, now);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(freqHz * 6, now);
        filter.frequency.exponentialRampToValueAtTime(freqHz * 1.5, now + duration * 0.75);
    }

    osc1.frequency.setValueAtTime(freqHz, now);
    if (mode === 'synth') {
        osc2.frequency.setValueAtTime(freqHz, now);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainScale, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration + 0.02);
    osc2.stop(now + duration + 0.02);
}

/**
 * Alias used by `TunerScreen.jsx` for playing reference string tones (e.g. `playNoteFrequency(freq)`).
 */
export function playNoteFrequency(freqHz, options = {}) {
    if (typeof options === 'number') {
        return playReferenceNote(freqHz, {
            mode: metronomeState.soundMode,
            duration: options,
        });
    }
    return playReferenceNote(freqHz, {
        mode: options.mode || metronomeState.soundMode,
        duration: options.duration || 1.8,
        ...options,
    });
}

export function playPolyphonicChord(
    frequencies = [],
    { mode = 'natural', duration = 2.1, strumSpreadSec = 0.038 } = {}
) {
    if (!Array.isArray(frequencies) || frequencies.length === 0) return;
    const perNoteGain = Math.min(0.24, 0.75 / Math.sqrt(frequencies.length));
    frequencies.forEach((freq, idx) => {
        playReferenceNote(freq, {
            mode,
            duration,
            startTimeOffset: idx * strumSpreadSec,
            gainScale: perNoteGain,
        });
    });
}
