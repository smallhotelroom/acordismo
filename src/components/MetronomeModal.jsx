/**
 * @file src/components/MetronomeModal.jsx
 * @version 1.1.0
 * Metronome & Reference Notes modal with 5-row compact layout and interactive Polyrhythm Roll Editor:
 * 1) Click: Natural/Synth + Keep on exit
 * 2) Master BPMs
 * 3) Start / Stop Metronome
 * 4) Beat subdivision (quick 4/4): 1/4, 1/8, 1/3 (Triplet), 1/16
 * 5) Multi-line Polyrhythm Roll Editor
 */
import React from 'react';
import { Pause, Play, Volume2, X } from 'lucide-react';
import MetronomeRollEditor from './MetronomeRollEditor';
import {
    addMetronomeTrack,
    cycleMetronomeTrackVoice,
    playReferenceNote,
    removeLastMetronomeTrack,
    setMetronomeBpm,
    setMetronomePersistent,
    setMetronomePlaying,
    setMetronomeSoundMode,
    setMetronomeSubdivision,
    setMetronomeTrackStepCount,
    toggleMetronomeTrackStep,
} from '../shared/audioEngine';

export const __version__ = '1.1.0';

const REFERENCE_NOTES = [
    { label: 'C4', freq: 261.63 },
    { label: 'D4', freq: 293.66 },
    { label: 'E4', freq: 329.63 },
    { label: 'F4', freq: 349.23 },
    { label: 'G4', freq: 392.0 },
    { label: 'A4', freq: 440.0 },
    { label: 'B4', freq: 493.88 },
];

export default function MetronomeModal({ visible, metroState, onClose }) {
    if (!visible || !metroState) {
        return null;
    }

    const handleCloseModal = () => {
        if (!metroState.persistent && metroState.isPlaying) {
            setMetronomePlaying(false);
        }
        onClose();
    };

    return (
        <div
            className="modal-backdrop"
            style={{ zIndex: 30000 }}
            onClick={handleCloseModal}>
            <div
                className="modal-card"
                style={{ maxWidth: 384, padding: '15px 17px' }}
                onClick={(e) => e.stopPropagation()}>
                {/* Modal Title Header */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottom: '1px solid var(--border-color)',
                        paddingBottom: 9,
                        marginBottom: 9,
                    }}>
                    <strong style={{ fontSize: '1.05rem' }}>Metronome</strong>
                    <button
                        type="button"
                        className="icon-btn"
                        title="Close"
                        onClick={handleCloseModal}
                        style={{ padding: 4 }}>
                        <X size={20} />
                    </button>
                </div>

                {/* ROW 1: Click Sound (Natural / Synth) + Keep on exit */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        marginBottom: 9,
                        paddingBottom: 9,
                        borderBottom: '1px solid var(--border-color)',
                        fontSize: '0.8rem',
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                            style={{
                                color: 'var(--text-secondary)',
                                fontWeight: 600,
                            }}>
                            Click:
                        </span>
                        <div
                            style={{
                                display: 'inline-flex',
                                background: 'var(--bg-primary)',
                                padding: 2,
                                borderRadius: 6,
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
                                            padding: '3px 8px',
                                            borderRadius: 4,
                                            border: 'none',
                                            fontWeight: 700,
                                            fontSize: '0.75rem',
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

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                            style={{
                                color: 'var(--text-secondary)',
                                fontWeight: 600,
                            }}>
                            Keep on exit:
                        </span>
                        <button
                            type="button"
                            onClick={() =>
                                setMetronomePersistent(!metroState.persistent)
                            }
                            style={{
                                padding: '3px 8px',
                                borderRadius: 6,
                                border: '1px solid var(--border-color)',
                                fontWeight: 700,
                                fontSize: '0.75rem',
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
                <div style={{ marginBottom: 9 }}>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: 5,
                        }}>
                        <button
                            type="button"
                            className="btn-primary"
                            onClick={() => setMetronomeBpm(metroState.bpm - 1)}>
                            -
                        </button>
                        <div style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: '1.5rem', fontWeight: 800 }}>
                                {metroState.bpm}
                            </span>
                            <span
                                style={{
                                    fontSize: '0.82rem',
                                    color: 'var(--text-secondary)',
                                    marginLeft: 6,
                                }}>
                                BPM
                            </span>
                        </div>
                        <button
                            type="button"
                            className="btn-primary"
                            onClick={() => setMetronomeBpm(metroState.bpm + 1)}>
                            +
                        </button>
                    </div>

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
                            width: '100%',
                            accentColor: 'var(--accent-color)',
                            cursor: 'pointer',
                        }}
                    />
                </div>

                {/* ROW 3: Start / Stop Metronome Button */}
                <div style={{ marginBottom: 10 }}>
                    <button
                        type="button"
                        className="btn-primary"
                        onClick={() => setMetronomePlaying(!metroState.isPlaying)}
                        style={{
                            width: '100%',
                            padding: '8px',
                            fontSize: '0.92rem',
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
                                <Pause size={16} /> Stop Metronome
                            </>
                        ) : (
                            <>
                                <Play size={16} /> Start Metronome
                            </>
                        )}
                    </button>
                </div>

                {/* ROW 4: Beat subdivision (quick 4/4) — 1/4, 1/8, 1/3, 1/16 */}
                <div style={{ marginBottom: 8 }}>
                    <div
                        style={{
                            fontSize: '0.76rem',
                            color: 'var(--text-secondary)',
                            marginBottom: 4,
                            fontWeight: 600,
                        }}>
                        Beat subdivision (quick 4/4)
                    </div>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(4, 1fr)',
                            gap: 5,
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
                                    title={`${opt.sub} (${opt.label})`}
                                    onClick={() => setMetronomeSubdivision(opt.val)}
                                    style={{
                                        padding: '5px 2px',
                                        fontSize: '0.74rem',
                                        fontWeight: 700,
                                        borderRadius: 6,
                                        border: '1px solid var(--border-color)',
                                        background: active
                                            ? 'var(--accent-color)'
                                            : 'var(--bg-primary)',
                                        color: active
                                            ? '#ffffff'
                                            : 'var(--text-primary)',
                                        cursor: 'pointer',
                                        lineHeight: 1.15,
                                    }}>
                                    <div>{opt.sub}</div>
                                    <div style={{ fontSize: '0.68rem', opacity: 0.85 }}>
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
                        marginBottom: 10,
                        paddingBottom: 10,
                        borderBottom: '1px solid var(--border-color)',
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

                {/* Reference Pitch Notes (C4 - B4) */}
                <div>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            marginBottom: 6,
                            fontSize: '0.82rem',
                            fontWeight: 700,
                        }}>
                        <Volume2 size={15} /> Reference Notes (C4 – B4)
                    </div>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(7, 1fr)',
                            gap: 5,
                        }}>
                        {REFERENCE_NOTES.map((n) => (
                            <button
                                key={n.label}
                                type="button"
                                onClick={() =>
                                    playReferenceNote(n.freq, {
                                        mode: metroState.soundMode,
                                    })
                                }
                                style={{
                                    padding: '6px 0',
                                    borderRadius: 6,
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--bg-primary)',
                                    color: 'var(--text-primary)',
                                    fontWeight: 700,
                                    fontSize: '0.78rem',
                                    cursor: 'pointer',
                                }}>
                                {n.label.replace('4', '')}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
