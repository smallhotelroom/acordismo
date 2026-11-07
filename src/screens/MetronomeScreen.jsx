/**
 * @file src/screens/MetronomeScreen.jsx
 * @version 2.0.0
 * 4/4 Precision Web Audio Metronome connected to the persistent global scheduler:
 * - Continues playing across screens when 'Persist Across Screens' is ON (default: true)
 * - Adjustable BPM (30 - 260 BPM) + Tap Tempo
 * - Subdivision selector: Quarter (1/4), Eighth (1/8), Sixteenth (1/16)
 * - Sound selector: Natural (Woodblock) vs Synth (Digital Click)
 */
import React, { useContext, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Moon, Pause, Pin, Play, Sun, Volume2 } from 'lucide-react';
import { AppContext } from '../shared/AppContext';
import {
    getMetronomeState,
    setMetronomeBpm,
    setMetronomePersistent,
    setMetronomePlaying,
    setMetronomeSoundMode,
    setMetronomeSubdivision,
    subscribeMetronomeBeat,
    subscribeMetronomeState,
    toggleMetronomePlaying,
} from '../shared/audioEngine';

export const __version__ = '2.0.0';

const SUBDIVISIONS = [
    { value: 1, label: '1/4', desc: 'Quarter' },
    { value: 2, label: '1/8', desc: 'Eighth' },
    { value: 4, label: '1/16', desc: 'Sixteenth' },
];

export default function MetronomeScreen({ onBack }) {
    const { darkMode, setDarkMode } = useContext(AppContext);

    const [metro, setMetro] = useState(() => getMetronomeState());
    const [currentBeat, setCurrentBeat] = useState(() => getMetronomeState().currentBeat);
    const tapTimesRef = useRef([]);

    useEffect(() => {
        const unsubState = subscribeMetronomeState((nextState) => {
            setMetro(nextState);
        });
        const unsubBeat = subscribeMetronomeBeat((beatIdx) => {
            setCurrentBeat(beatIdx);
        });

        return () => {
            unsubState();
            unsubBeat();
            // Only stop on unmount if the user explicitly disabled persistence!
            const latest = getMetronomeState();
            if (!latest.persistent && latest.isPlaying) {
                setMetronomePlaying(false);
            }
        };
    }, []);

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
            setMetronomeBpm(tappedBpm);
        }
    };

    const { isPlaying, bpm, subdivision, soundMode, persistent } = metro;

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
                {/* Sound Mode & Persistence Bar */}
                <div
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-surface)',
                        marginBottom: 18,
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Volume2 size={18} />
                        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Click:</span>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                            {['natural', 'synth'].map((m) => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => setMetronomeSoundMode(m)}
                                    style={{
                                        padding: '5px 12px',
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

                    <button
                        type="button"
                        title="Keep metronome playing when you navigate to songs"
                        onClick={() => setMetronomePersistent(!persistent)}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 12px',
                            borderRadius: 999,
                            fontWeight: 700,
                            fontSize: '0.82rem',
                            border: persistent
                                ? '1px solid #2563eb'
                                : '1px solid var(--border-color)',
                            background: persistent ? '#2563eb' : 'transparent',
                            color: persistent ? '#ffffff' : 'var(--text-primary)',
                            cursor: 'pointer',
                        }}>
                        <Pin size={14} />
                        {persistent ? 'Persist in Songs: ON' : 'Persist in Songs: OFF'}
                    </button>
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
                        onChange={(e) => setMetronomeBpm(Number(e.target.value))}
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
                            onClick={() => setMetronomeBpm(bpm - 5)}>
                            -5
                        </button>
                        <button
                            className="btn-primary"
                            onClick={() => setMetronomeBpm(bpm - 1)}>
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
                            onClick={() => setMetronomeBpm(bpm + 1)}>
                            +1
                        </button>
                        <button
                            className="btn-primary"
                            onClick={() => setMetronomeBpm(bpm + 5)}>
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
                                    onClick={() => setMetronomeSubdivision(sub.value)}
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
                    onClick={() => toggleMetronomePlaying()}
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
