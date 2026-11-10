/**
 * @file src/components/SongStrumModal.jsx
 * @version 1.0.0
 * Phase 2 6-String (Guitar) / 4-String (Ukulele) Strum & Arpeggio Roll Editor Modal for SongScreen.
 * Each horizontal row corresponds to a physical instrument string (`1e` down to `6E` in tab order),
 * allowing users to select quick presets (Quarter, Campfire, Arpeggio, Travis, Triplet) or tap dots
 * to craft custom arpeggio/strumming patterns for the song!
 */
import React from 'react';
import { Pause, Play, X } from 'lucide-react';
import { STRUM_PRESETS } from '../shared/songChordPlayer';

export const __version__ = '1.0.0';

export default function SongStrumModal({
    visible,
    instrument = 'guitar',
    onSelectInstrument,
    strumPresetId = 'quarter',
    onSelectPreset,
    strumTracks = [],
    onToggleStrumDot,
    onChangeStepsPerBar,
    activeStepInBar = -1,
    chordPlayActive = false,
    onToggleChordPlay,
    effectiveSongBpm = 120,
    currentPlayingChord = null,
    onClose,
}) {
    if (!visible) {
        return null;
    }

    const numSteps = strumTracks[0]?.steps?.length || 4;
    // Display strings in standard Guitar Tablature vertical order: High string (1e / 1A) at top, Bass (6E / 4G) at bottom
    const displayIndices = strumTracks.map((_, idx) => idx).reverse();

    return (
        <div
            className="modal-backdrop"
            style={{ zIndex: 30000 }}
            onClick={onClose}>
            <div
                className="modal-card"
                style={{ maxWidth: 410, padding: '15px 17px' }}
                onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottom: '1px solid var(--border-color)',
                        paddingBottom: 9,
                        marginBottom: 10,
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <strong style={{ fontSize: '1rem' }}>
                            Strum & Arpeggio Roll
                        </strong>
                        <span
                            style={{
                                fontSize: '0.75rem',
                                color: 'var(--text-secondary)',
                                fontWeight: 600,
                            }}>
                            ({effectiveSongBpm} BPM)
                        </span>
                    </div>
                    <button
                        type="button"
                        className="icon-btn"
                        title="Close"
                        onClick={onClose}
                        style={{ padding: 4 }}>
                        <X size={20} />
                    </button>
                </div>

                {/* Row 1: Instrument Switcher (Guitar 6-String vs Ukulele 4-String) + Play/Stop */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        marginBottom: 10,
                    }}>
                    <div
                        style={{
                            display: 'inline-flex',
                            background: 'var(--bg-primary)',
                            padding: 2,
                            borderRadius: 6,
                            border: '1px solid var(--border-color)',
                        }}>
                        {[
                            { id: 'guitar', label: 'Guitar (6 str)' },
                            { id: 'ukulele', label: 'Ukulele (4 str)' },
                        ].map((inst) => {
                            const active = instrument === inst.id;
                            return (
                                <button
                                    key={inst.id}
                                    type="button"
                                    onClick={() =>
                                        onSelectInstrument &&
                                        onSelectInstrument(inst.id)
                                    }
                                    style={{
                                        padding: '4px 9px',
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
                                    {inst.label}
                                </button>
                            );
                        })}
                    </div>

                    <button
                        type="button"
                        className="btn-primary"
                        onClick={onToggleChordPlay}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 12px',
                            fontSize: '0.8rem',
                            fontWeight: 800,
                            background: chordPlayActive
                                ? '#dc2626'
                                : 'var(--accent-color)',
                        }}>
                        {chordPlayActive ? (
                            <>
                                <Pause size={14} />
                                {currentPlayingChord
                                    ? `Stop (${currentPlayingChord})`
                                    : 'Stop'}
                            </>
                        ) : (
                            <>
                                <Play size={14} /> Play Song
                            </>
                        )}
                    </button>
                </div>

                {/* Row 2: 5 Quick Pattern Presets */}
                <div style={{ marginBottom: 10 }}>
                    <div
                        style={{
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            color: 'var(--text-secondary)',
                            marginBottom: 5,
                        }}>
                        Pattern preset
                    </div>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(5, 1fr)',
                            gap: 4,
                        }}>
                        {STRUM_PRESETS.map((p) => {
                            const active = strumPresetId === p.id;
                            return (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() =>
                                        onSelectPreset && onSelectPreset(p.id)
                                    }
                                    style={{
                                        padding: '5px 2px',
                                        borderRadius: 6,
                                        border: '1px solid var(--border-color)',
                                        background: active
                                            ? 'var(--accent-color)'
                                            : 'var(--bg-primary)',
                                        color: active
                                            ? '#ffffff'
                                            : 'var(--text-primary)',
                                        fontWeight: 700,
                                        fontSize: '0.68rem',
                                        lineHeight: 1.15,
                                        cursor: 'pointer',
                                    }}>
                                    <div>{p.sub}</div>
                                    <div
                                        style={{
                                            fontSize: '0.62rem',
                                            opacity: 0.85,
                                        }}>
                                        {p.label.split(' ')[1]}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Row 3: 6-String / 4-String Interactive Arpeggio Roll Grid */}
                <div>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: 5,
                            fontSize: '0.74rem',
                            color: 'var(--text-secondary)',
                        }}>
                        <span style={{ fontWeight: 600 }}>
                            String roll (high string on top, bass at bottom)
                        </span>
                        {/* Bar Subdivisions Stepper */}
                        <div
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                            }}>
                            <span>Steps:</span>
                            <div
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    height: 22,
                                    borderRadius: 5,
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--bg-primary)',
                                }}>
                                <button
                                    type="button"
                                    disabled={numSteps <= 1}
                                    onClick={() =>
                                        onChangeStepsPerBar &&
                                        onChangeStepsPerBar(numSteps - 1)
                                    }
                                    style={{
                                        width: 18,
                                        height: '100%',
                                        border: 'none',
                                        background: 'transparent',
                                        color: 'var(--text-primary)',
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                    }}>
                                    -
                                </button>
                                <span
                                    style={{
                                        minWidth: 18,
                                        textAlign: 'center',
                                        fontWeight: 800,
                                        fontSize: '0.72rem',
                                        color: 'var(--text-primary)',
                                    }}>
                                    {numSteps}
                                </span>
                                <button
                                    type="button"
                                    disabled={numSteps >= 16}
                                    onClick={() =>
                                        onChangeStepsPerBar &&
                                        onChangeStepsPerBar(numSteps + 1)
                                    }
                                    style={{
                                        width: 18,
                                        height: '100%',
                                        border: 'none',
                                        background: 'transparent',
                                        color: 'var(--text-primary)',
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                    }}>
                                    +
                                </button>
                            </div>
                        </div>
                    </div>

                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                            padding: '8px',
                            borderRadius: 8,
                            background: 'var(--bg-primary)',
                            border: '1px solid var(--border-color)',
                        }}>
                        {displayIndices.map((sIdx) => {
                            const track = strumTracks[sIdx];
                            if (!track) return null;
                            const isBassString =
                                instrument === 'ukulele' ? sIdx === 0 : sIdx <= 1;
                            const dotColor = isBassString ? '#2563eb' : '#10b981';
                            const activeBg = isBassString
                                ? 'rgba(37, 99, 235, 0.24)'
                                : 'rgba(16, 185, 129, 0.24)';

                            return (
                                <div
                                    key={track.id || sIdx}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                    }}>
                                    {/* String Label Badge (1e .. 6E) */}
                                    <div
                                        style={{
                                            width: 26,
                                            height: 24,
                                            borderRadius: 5,
                                            background: isBassString
                                                ? 'rgba(37, 99, 235, 0.14)'
                                                : 'rgba(16, 185, 129, 0.14)',
                                            color: dotColor,
                                            fontWeight: 800,
                                            fontSize: '0.7rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0,
                                            userSelect: 'none',
                                        }}>
                                        {track.label}
                                    </div>

                                    {/* Steps Row */}
                                    <div
                                        style={{
                                            display: 'flex',
                                            flex: 1,
                                            gap: numSteps >= 12 ? 2 : 3,
                                        }}>
                                        {track.steps.map((hasDot, stepIdx) => {
                                            const isPlayheadHere =
                                                chordPlayActive &&
                                                activeStepInBar === stepIdx;
                                            const isBeatBoundary =
                                                numSteps > 4 &&
                                                numSteps % 4 === 0 &&
                                                stepIdx > 0 &&
                                                stepIdx % (numSteps / 4) === 0;

                                            return (
                                                <button
                                                    key={stepIdx}
                                                    type="button"
                                                    onClick={() =>
                                                        onToggleStrumDot &&
                                                        onToggleStrumDot(
                                                            sIdx,
                                                            stepIdx
                                                        )
                                                    }
                                                    style={{
                                                        flex: 1,
                                                        height: 24,
                                                        padding: 0,
                                                        marginLeft: isBeatBoundary
                                                            ? 2
                                                            : 0,
                                                        borderRadius: 4,
                                                        border: `1px solid ${
                                                            isPlayheadHere
                                                                ? dotColor
                                                                : 'var(--border-color)'
                                                        }`,
                                                        background: isPlayheadHere
                                                            ? activeBg
                                                            : 'var(--bg-surface)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        cursor: 'pointer',
                                                    }}>
                                                    <span
                                                        style={{
                                                            width:
                                                                numSteps >= 12
                                                                    ? 5.5
                                                                    : 7,
                                                            height:
                                                                numSteps >= 12
                                                                    ? 5.5
                                                                    : 7,
                                                            borderRadius: '50%',
                                                            background: hasDot
                                                                ? dotColor
                                                                : 'var(--border-color)',
                                                            opacity: hasDot
                                                                ? 1
                                                                : 0.3,
                                                        }}
                                                    />
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
