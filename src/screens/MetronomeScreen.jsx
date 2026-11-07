/**
 * @file src/screens/MetronomeScreen.jsx
 * @version 1.0.0
 * 4/4 Precision Web Audio Metronome with:
 * - Adjustable BPM (30 - 260 BPM) + Tap Tempo
 * - Subdivision selector: Quarter (1/4), Eighth (1/8), Sixteenth (1/16)
 * - Sound selector: Natural (Woodblock) vs Synth (Digital Click)
 * - Visual 4-beat LED indicator
 */
import React, { useContext, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Moon, Pause, Play, Sun, Volume2 } from 'lucide-react';
import { AppContext } from '../shared/AppContext';
import { getAudioContext, scheduleMetronomeClick } from '../shared/audioEngine';

export const __version__ = '1.0.0';

const METRONOME_BPM_KEY = 'acordismo_metronome_bpm';
const METRONOME_SUB_KEY = 'acordismo_metronome_subdivision';
const METRONOME_SOUND_KEY = 'acordismo_metronome_sound_mode';

const SUBDIVISIONS = [
    { value: 1, label: '1/4', desc: 'Quarter' },
    { value: 2, label: '1/8', desc: 'Eighth' },
    { value: 4, label: '1/16', desc: 'Sixteenth' },
];

export default function MetronomeScreen({ onBack }) {
    const { darkMode, setDarkMode } = useContext(AppContext);

    const [bpm, setBpm] = useState(() => {
        const saved = parseInt(localStorage.getItem(METRONOME_BPM_KEY), 10);
        return !Number.isNaN(saved) && saved >= 30 && saved <= 260 ? saved : 120;
    });
    const [subdivision, setSubdivision] = useState(() => {
        const saved = parseInt(localStorage.getItem(METRONOME_SUB_KEY), 10);
        return [1, 2, 4].includes(saved) ? saved : 1;
    });
    const [soundMode, setSoundMode] = useState(() => {
        return localStorage.getItem(METRONOME_SOUND_KEY) || 'natural';
    });
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentBeat, setCurrentBeat] = useState(0); // 0..3 for the 4 quarter beats

    // Refs for real-time Web Audio lookahead scheduler
    const bpmRef = useRef(bpm);
    const subRef = useRef(subdivision);
    const soundModeRef = useRef(soundMode);
    const nextNoteTimeRef = useRef(0);
    const currentSubStepRef = useRef(0);
    const timerIdRef = useRef(null);
    const tapTimesRef = useRef([]);

    useEffect(() => {
        bpmRef.current = bpm;
        localStorage.setItem(METRONOME_BPM_KEY, String(bpm));
    }, [bpm]);

    useEffect(() => {
        subRef.current = subdivision;
        localStorage.setItem(METRONOME_SUB_KEY, String(subdivision));
    }, [subdivision]);

    useEffect(() => {
        soundModeRef.current = soundMode;
        localStorage.setItem(METRONOME_SOUND_KEY, soundMode);
    }, [soundMode]);

    useEffect(() => {
        if (!isPlaying) {
            if (timerIdRef.current) {
                clearInterval(timerIdRef.current);
                timerIdRef.current = null;
            }
            return;
        }

        const ctx = getAudioContext();
        nextNoteTimeRef.current = ctx.currentTime + 0.04;
        currentSubStepRef.current = 0;

        const scheduleAheadTime = 0.1; // 100ms lookahead window
        const lookaheadIntervalMs = 25;

        const scheduler = () => {
            while (nextNoteTimeRef.current < ctx.currentTime + scheduleAheadTime) {
                const sub = subRef.current;
                const totalStepsInBar = 4 * sub;
                const stepIndex = currentSubStepRef.current % totalStepsInBar;
                const isMainBeat = stepIndex % sub === 0;
                const beatNumber = Math.floor(stepIndex / sub); // 0, 1, 2, 3

                const beatType =
                    stepIndex === 0 ? 'accent' : isMainBeat ? 'quarter' : 'sub';

                scheduleMetronomeClick(
                    ctx,
                    nextNoteTimeRef.current,
                    beatType,
                    soundModeRef.current
                );

                if (isMainBeat) {
                    const delayMs = Math.max(
                        0,
                        (nextNoteTimeRef.current - ctx.currentTime) * 1000
                    );
                    const scheduledBeat = beatNumber;
                    setTimeout(() => {
                        setCurrentBeat(scheduledBeat);
                    }, delayMs);
                }

                const secondsPerQuarter = 60.0 / bpmRef.current;
                const secondsPerSubStep = secondsPerQuarter / sub;
                nextNoteTimeRef.current += secondsPerSubStep;
                currentSubStepRef.current = (stepIndex + 1) % totalStepsInBar;
            }
        };

        timerIdRef.current = setInterval(scheduler, lookaheadIntervalMs);
        return () => {
            if (timerIdRef.current) {
                clearInterval(timerIdRef.current);
                timerIdRef.current = null;
            }
        };
    }, [isPlaying]);

    const updateBpm = (val) => {
        const clamped = Math.max(30, Math.min(260, Math.round(val)));
        setBpm(clamped);
    };

    const handleTapTempo = () => {
        const now = performance.now();
        const taps = tapTimesRef.current.filter((t) => now - t < 2500);
        taps.push(now);
        tapTimesRef.current = taps;

        if (taps.length >= 2) {
            let totalIntervals = 0;
            for (let i = 1; i < taps.length; i++) {
                totalIntervals += taps[i] - taps[i - 1];
            }
            const avgMs = totalIntervals / (taps.length - 1);
            const tappedBpm = Math.round(60000 / avgMs);
            updateBpm(tappedBpm);
        }
    };

    return (
        <>
            <header className="app-header">
                <div className="header-left">
                    <button className="icon-btn" onClick={onBack}>
                        <ArrowLeft size={22} />
                    </button>
                    <h1 className="header-title">Metronome (4/4)</h1>
                </div>
                <div className="header-actions">
                    <button
                        className="icon-btn"
                        title="Toggle Dark Mode"
                        onClick={() => setDarkMode(!darkMode)}>
                        {darkMode ? <Sun size={20} /> : <Moon size={20} />}
                    </button>
                </div>
            </header>

            <main className="content-scroll" style={{ padding: 16 }}>
                {/* Sound Mode Bar */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-surface)',
                        marginBottom: 18,
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Volume2 size={18} />
                        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Click Sound:</span>
                    </div>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                        {['natural', 'synth'].map((m) => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => setSoundMode(m)}
                                style={{
                                    padding: '5px 14px',
                                    borderRadius: 999,
                                    fontWeight: 700,
                                    fontSize: '0.82rem',
                                    textTransform: 'capitalize',
                                    border:
                                        soundMode === m
                                            ? '1px solid #2563eb'
                                            : '1px solid var(--border-color)',
                                    background:
                                        soundMode === m ? '#2563eb' : 'transparent',
                                    color:
                                        soundMode === m
                                            ? '#ffffff'
                                            : 'var(--text-primary)',
                                    cursor: 'pointer',
                                }}>
                                {m}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 4/4 Visual Beat Indicator */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: 12,
                        marginBottom: 22,
                    }}>
                    {[0, 1, 2, 3].map((beatIdx) => {
                        const active = isPlaying && currentBeat === beatIdx;
                        const isDownbeat = beatIdx === 0;
                        return (
                            <div
                                key={beatIdx}
                                style={{
                                    height: 54,
                                    borderRadius: 10,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 800,
                                    fontSize: '1.15rem',
                                    border: active
                                        ? `2px solid ${isDownbeat ? '#f59e0b' : '#2563eb'}`
                                        : '1px solid var(--border-color)',
                                    background: active
                                        ? isDownbeat
                                            ? '#f59e0b'
                                            : '#2563eb'
                                        : 'var(--bg-surface)',
                                    color: active ? '#ffffff' : 'var(--text-secondary)',
                                    transition: 'all 0.06s ease',
                                }}>
                                {beatIdx + 1}
                            </div>
                        );
                    })}
                </div>

                {/* BPM Display & Controls */}
                <div
                    style={{
                        padding: 18,
                        borderRadius: 12,
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-surface)',
                        textAlign: 'center',
                        marginBottom: 18,
                    }}>
                    <div
                        style={{
                            fontSize: '2.8rem',
                            fontWeight: 800,
                            lineHeight: 1.1,
                            marginBottom: 4,
                        }}>
                        {bpm}{' '}
                        <span
                            style={{
                                fontSize: '1rem',
                                fontWeight: 600,
                                color: 'var(--text-secondary)',
                            }}>
                            BPM
                        </span>
                    </div>

                    <input
                        type="range"
                        min="30"
                        max="260"
                        step="1"
                        value={bpm}
                        onChange={(e) => updateBpm(Number(e.target.value))}
                        style={{
                            width: '100%',
                            margin: '14px 0',
                            cursor: 'pointer',
                        }}
                    />

                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'center',
                            gap: 8,
                            flexWrap: 'wrap',
                        }}>
                        <button
                            className="btn-primary"
                            onClick={() => updateBpm(bpm - 5)}>
                            -5
                        </button>
                        <button
                            className="btn-primary"
                            onClick={() => updateBpm(bpm - 1)}>
                            -1
                        </button>
                        <button
                            className="btn-primary"
                            style={{ background: '#4b5563' }}
                            onClick={handleTapTempo}>
                            TAP
                        </button>
                        <button
                            className="btn-primary"
                            onClick={() => updateBpm(bpm + 1)}>
                            +1
                        </button>
                        <button
                            className="btn-primary"
                            onClick={() => updateBpm(bpm + 5)}>
                            +5
                        </button>
                    </div>
                </div>

                {/* Beat Subdivision Selector (1/4, 1/8, 1/16) */}
                <div style={{ marginBottom: 24 }}>
                    <div
                        style={{
                            fontWeight: 800,
                            fontSize: '0.95rem',
                            marginBottom: 10,
                        }}>
                        Beat Subdivision
                    </div>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: 10,
                        }}>
                        {SUBDIVISIONS.map((sub) => {
                            const selected = subdivision === sub.value;
                            return (
                                <button
                                    key={sub.value}
                                    type="button"
                                    onClick={() => setSubdivision(sub.value)}
                                    style={{
                                        padding: '12px 8px',
                                        borderRadius: 10,
                                        border: selected
                                            ? '2px solid #2563eb'
                                            : '1px solid var(--border-color)',
                                        background: selected
                                            ? 'rgba(37, 99, 235, 0.14)'
                                            : 'var(--bg-surface)',
                                        color: 'var(--text-primary)',
                                        cursor: 'pointer',
                                    }}>
                                    <div
                                        style={{
                                            fontSize: '1.2rem',
                                            fontWeight: 800,
                                            color: selected
                                                ? '#2563eb'
                                                : 'var(--text-primary)',
                                        }}>
                                        {sub.label}
                                    </div>
                                    <div
                                        style={{
                                            fontSize: '0.78rem',
                                            color: 'var(--text-secondary)',
                                            marginTop: 2,
                                        }}>
                                        {sub.desc}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Big Start / Stop Button */}
                <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setIsPlaying((prev) => !prev)}
                    style={{
                        width: '100%',
                        padding: '14px',
                        fontSize: '1.1rem',
                        fontWeight: 800,
                        borderRadius: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 10,
                        background: isPlaying ? '#dc2626' : '#2563eb',
                    }}>
                    {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                    {isPlaying ? 'STOP METRONOME' : 'START METRONOME'}
                </button>
            </main>
        </>
    );
}
