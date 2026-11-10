/**
 * @file src/shared/audioEngine.js
 * @version 2.2.0
 * Web Audio API synthesis engine for Acordismo:
 * - Polyphonic guitar/ukulele chord strumming & Reference pitch generator
 * - Multi-track / polyrhythm-ready Metronome scheduler with quick 4/4 presets:
 *   - 1/4 (Quarter):   1 track  (4 steps)  -> AAAA
 *   - 1/8 (Eighth):    2 tracks (8 steps)  -> Top: A·A·A·A· (4), Bottom: ·B·B·B·B (4) = ABABABAB
 *   - 1/16 (Sixteenth): 2 tracks (16 steps) -> Top: A···A···A···A··· (4), Bottom: ·BBB·BBB·BBB·BBB (12) = ABBBABBBABBBABBB
 */
import { APP_DEFAULTS } from './AppContext';

export const __version__ = '2.2.0';

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

/**
 * Builds the default multi-track roll pattern for the quick 4/4 subdivision buttons (1, 2, or 4).
 * Each track has constant-height blocks whose width is 1 / track.steps.length of the bar.
 */
export function buildQuick44Tracks(subdivision = 1) {
    const sub = Number(subdivision) || 1;
    if (sub <= 1) {
        // 5.1) 1/4: 1 line with 4 subdivisions, a dot on each subdivision (AAAA)
        return [
            {
                id: 'A',
                label: 'A',
                voice: 'high',
                steps: [true, true, true, true],
            },
        ];
    }

    const totalSteps = 4 * sub; // 8 for 1/8, 16 for 1/16
    const topSteps = [];
    const bottomSteps = [];

    for (let i = 0; i < totalSteps; i++) {
        const isMainBeat = i % sub === 0;
        topSteps.push(isMainBeat);
        bottomSteps.push(!isMainBeat);
    }

    // 5.2) 1/8  -> 2 lines with 8 subdivisions (top: 4 dots, bottom: 4 complementary dots -> ABABABAB)
    // 5.3) 1/16 -> 2 lines with 16 subdivisions (top: 4 dots, bottom: 12 complementary dots -> ABBBABBBABBBABBB)
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
        if ([1, 2, 4].includes(saved)) return saved;
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
    subdivision: initialSubdiv, // 1 = Quarter (1/4), 2 = Eighth (1/8), 4 = Sixteenth (1/16)
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
 * `voice`: 'high' (Track A / primary pulse) or 'low' (Track B / subdivision pulse).
 */
function scheduleMetronomeClickAt(ctx, time, voice = 'high', soundMode = 'natural') {
    const isHigh = voice === 'high';

    if (soundMode === 'synth') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(isHigh ? 1046.5 : 659.25, time); // C6 (A) vs E5 (B)

        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.linearRampToValueAtTime(isHigh ? 0.34 : 0.2, time + 0.003);
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
    const startFreq = isHigh ? 1320 : 880;
    const endFreq = isHigh ? 520 : 360;
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + 0.028);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(isHigh ? 0.42 : 0.24, time + 0.002);
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
    const valid = [1, 2, 4].includes(Number(nextSubdiv)) ? Number(nextSubdiv) : 1;
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
        // Warm plucked acoustic string envelope
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
