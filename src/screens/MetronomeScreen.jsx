/**
 * @file src/screens/MetronomeScreen.jsx
 * @version 2.1.2
 * Full-screen Metronome with compact 5-row layout and interactive Polyrhythm Roll Editor:
 * 1) Click: Natural/Synth + Keep on exit
 * 2) Master BPMs (- / BPM / + and range slider)
 * 3) Start / Stop Metronome
 * 4) Beat subdivision: Quarter (1/4), Eighth (1/8), Triplet (1/3), Sixteenth (1/16)
 * 5) Multi-line Polyrhythm Roll Editor (MetronomeRollEditor)
 */
import React, { useContext, useEffect, useState } from 'react';
import { ArrowLeft, Moon, Pause, Play, RotateCcw, Sun } from 'lucide-react';
import { AppContext } from '../shared/AppContext';
import MetronomeRollEditor from '../components/MetronomeRollEditor';
import {
    addMetronomeTrack,
    cycleMetronomeTrackVoice,
    getMetronomeState,
    removeLastMetronomeTrack,
    setMetronomeBpm,
    setMetronomePersistent,
    setMetronomePlaying,
    setMetronomeSoundMode,
    setMetronomeSubdivision,
    setMetronomeTrackStepCount,
    subscribeMetronomeState,
    toggleMetronomePlaying,
    toggleMetronomeTrackStep,
} from '../shared/audioEngine';

export const __version__ = '2.1.1';

export default function MetronomeScreen({ onBack }) {
    const { darkMode, setDarkMode } = useContext(AppContext);
    const [metroState, setMetroState] = useState(() => getMetronomeState());

    useEffect(() => {
        return subscribeMetronomeState((st) => setMetroState(st));
    }, []);

    const handleBack = () => {
        const latest = getMetronomeState();
        if (!latest.persistent && latest.isPlaying) {
            setMetronomePlaying(false);
        }
        onBack();
    };

    return (
        <>
            <header className="app-header">
                <div className="header-left">
                    <button className="icon-btn" onClick={handleBack}>
                        <ArrowLeft size={22} />
                    </button>
                    <h1 className="header-title">SHR Metronome</h1>
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

            <main className="content-scroll">
                <div
                    style={{
                        maxWidth: 460,
                        margin: '0 auto',
                        padding: '12px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                    }}>
                    {/* ROW 1: Click (Natural / Synth) + Keep on exit */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: 10,
                            padding: '10px 14px',
                            borderRadius: 10,
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-surface)',
                            fontSize: '0.86rem',
                        }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>
                                Click:
                            </span>
                            <div
                                style={{
                                    display: 'inline-flex',
                                    background: 'var(--bg-primary)',
                                    padding: 3,
                                    borderRadius: 8,
                                    border: '1px solid var(--border-color)',
                                }}>
                                {[
                                    { id: 'natural', label: 'Natural' },
                                    { id: 'synth', label: 'Synth' },
                                ].map((opt) => {
                                    const active = metroState.soundMode === opt.id;
                                    return (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() => setMetronomeSoundMode(opt.id)}
                                            style={{
                                                padding: '4px 10px',
                                                borderRadius: 6,
                                                border: 'none',
                                                fontWeight: 700,
                                                fontSize: '0.8rem',
                                                background: active
                                                    ? 'var(--accent-color)'
                                                    : 'transparent',
                                                color: active
                                                    ? '#ffffff'
                                                    : 'var(--text-secondary)',
                                                cursor: 'pointer',
                                            }}>
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>
                                Keep on exit:
                            </span>
                            <button
                                type="button"
                                onClick={() =>
                                    setMetronomePersistent(!metroState.persistent)
                                }
                                style={{
                                    padding: '4px 10px',
                                    borderRadius: 6,
                                    border: '1px solid var(--border-color)',
                                    fontWeight: 700,
                                    fontSize: '0.8rem',
                                    background: metroState.persistent
                                        ? 'var(--accent-color)'
                                        : 'var(--bg-primary)',
                                    color: metroState.persistent
                                        ? '#ffffff'
                                        : 'var(--text-secondary)',
                                    cursor: 'pointer',
                                }}>
                                {metroState.persistent ? 'ON' : 'OFF'}
                            </button>
                        </div>
                    </div>

                    {/* ROW 2: Master BPM Controls */}
                    <div
                        style={{
                            padding: '12px 14px',
                            borderRadius: 10,
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-surface)',
                        }}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: 8,
                            }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                    type="button"
                                    className="btn-primary"
                                    onClick={() => setMetronomeBpm(metroState.bpm - 5)}>
                                    -5
                                </button>
                                <button
                                    type="button"
                                    className="btn-primary"
                                    onClick={() => setMetronomeBpm(metroState.bpm - 1)}>
                                    -1
                                </button>
                            </div>

                            <div style={{ textAlign: 'center' }}>
                                <span style={{ fontSize: '1.85rem', fontWeight: 800 }}>
                                    {metroState.bpm}
                                </span>
                                <span
                                    style={{
                                        fontSize: '0.85rem',
                                        color: 'var(--text-secondary)',
                                        marginLeft: 5,
                                        fontWeight: 700,
                                    }}>
                                    BPM
                                </span>
                            </div>

                            <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                    type="button"
                                    className="btn-primary"
                                    onClick={() => setMetronomeBpm(metroState.bpm + 1)}>
                                    +1
                                </button>
                                <button
                                    type="button"
                                    className="btn-primary"
                                    onClick={() => setMetronomeBpm(metroState.bpm + 5)}>
                                    +5
                                </button>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <input
                                type="range"
                                min="40"
                                max="240"
                                value={metroState.bpm}
                                onChange={(e) =>
                                    setMetronomeBpm(parseInt(e.target.value, 10))
                                }
                                onDoubleClick={() => setMetronomeBpm(120)}
                                style={{
                                    flex: 1,
                                    accentColor: 'var(--accent-color)',
                                    cursor: 'pointer',
                                }}
                            />
                            <button
                                type="button"
                                className="icon-btn"
                                title="Reset to 120 BPM"
                                onClick={() => setMetronomeBpm(120)}
                                style={{ padding: 4 }}>
                                <RotateCcw size={17} />
                            </button>
                        </div>
                    </div>

                    {/* ROW 3: Start / Stop Metronome */}
                    <button
                        type="button"
                        className="btn-primary"
                        onClick={() => toggleMetronomePlaying()}
                        style={{
                            width: '100%',
                            padding: '11px',
                            fontSize: '1rem',
                            fontWeight: 800,
                            borderRadius: 10,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            background: metroState.isPlaying
                                ? '#dc2626'
                                : 'var(--accent-color)',
                        }}>
                        {metroState.isPlaying ? (
                            <>
                                <Pause size={18} /> Stop Metronome
                            </>
                        ) : (
                            <>
                                <Play size={18} /> Start Metronome
                            </>
                        )}
                    </button>

                    {/* ROW 4: Beat subdivision */}
                    <div
                        style={{
                            padding: '10px 14px',
                            borderRadius: 10,
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-surface)',
                        }}>
                        <div
                            style={{
                                fontSize: '0.82rem',
                                fontWeight: 700,
                                color: 'var(--text-secondary)',
                                marginBottom: 8,
                            }}>
                            Beat subdivision
                        </div>
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(4, 1fr)',
                                gap: 6,
                            }}>
                            {[
                                { val: 1, label: '1/4', sub: 'Quarter' },
                                { val: 2, label: '1/8', sub: 'Eighth' },
                                { val: 3, label: '1/3', sub: 'Triplet' },
                                { val: 4, label: '1/16', sub: 'Sixteenth' },
                            ].map((opt) => {
                                const active = metroState.subdivision === opt.val;
                                return (
                                    <button
                                        key={opt.val}
                                        type="button"
                                        onClick={() => setMetronomeSubdivision(opt.val)}
                                        style={{
                                            padding: '7px 4px',
                                            borderRadius: 8,
                                            border: '1px solid var(--border-color)',
                                            fontWeight: 700,
                                            fontSize: '0.78rem',
                                            background: active
                                                ? 'var(--accent-color)'
                                                : 'var(--bg-primary)',
                                            color: active
                                                ? '#ffffff'
                                                : 'var(--text-primary)',
                                            cursor: 'pointer',
                                            lineHeight: 1.2,
                                        }}>
                                        <div>{opt.sub}</div>
                                        <div style={{ fontSize: '0.7rem', opacity: 0.85 }}>
                                            ({opt.label})
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* ROW 5: Interactive Multi-Line Polyrhythm Roll Editor */}
                    <div
                        style={{
                            padding: '10px 14px',
                            borderRadius: 10,
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-surface)',
                        }}>
                        <MetronomeRollEditor
                            tracks={metroState.tracks}
                            currentStepByTrack={metroState.currentStepByTrack}
                            isPlaying={metroState.isPlaying}
                            onToggleStep={toggleMetronomeTrackStep}
                            onChangeTrackSteps={setMetronomeTrackStepCount}
                            onCycleTrackVoice={cycleMetronomeTrackVoice}
                            onAddTrack={addMetronomeTrack}
                            onRemoveTrack={removeLastMetronomeTrack}
                        />
                    </div>
                </div>
            </main>
        </>
    );
}
