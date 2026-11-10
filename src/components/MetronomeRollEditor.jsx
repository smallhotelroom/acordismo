/**
 * @file src/components/MetronomeRollEditor.jsx
 * @version 1.1.0
 * Compact interactive Polyrhythm Roll Editor for the Acordismo Metronome.
 * - Left badge (`A`, `B`, `C`, `D`): tap to cycle click pitch (High = Blue, Low = Amber, Mid = Green).
 * - Middle blocks: constant height (26px), proportional bar width (`flex: 1`); tap any block to toggle its dot.
 * - Right pill (`- N +`): adjust each track's step count (1..16) independently for instant polyrhythms.
 * - Top micro-bar: `+ Line` / `- Line` to add or remove tracks (1..4) without adding modal height.
 */
import React from 'react';

export const __version__ = '1.1.0';

const TRACK_COLORS = {
    high: {
        name: 'High pitch',
        dot: '#2563eb',
        activeBg: 'rgba(37, 99, 235, 0.24)',
        activeBorder: '#2563eb',
        badgeBg: 'rgba(37, 99, 235, 0.15)',
        badgeText: '#2563eb',
    },
    low: {
        name: 'Low pitch',
        dot: '#f59e0b',
        activeBg: 'rgba(245, 158, 11, 0.24)',
        activeBorder: '#f59e0b',
        badgeBg: 'rgba(245, 158, 11, 0.16)',
        badgeText: '#f59e0b',
    },
    mid: {
        name: 'Mid pitch',
        dot: '#10b981',
        activeBg: 'rgba(16, 185, 129, 0.24)',
        activeBorder: '#10b981',
        badgeBg: 'rgba(16, 185, 129, 0.16)',
        badgeText: '#10b981',
    },
};

export default function MetronomeRollEditor({
    tracks = [],
    currentStepByTrack = [],
    isPlaying = false,
    onToggleStep,
    onChangeTrackSteps,
    onCycleTrackVoice,
    onAddTrack,
    onRemoveTrack,
}) {
    if (!Array.isArray(tracks) || tracks.length === 0) {
        return null;
    }

    return (
        <div>
            {/* Ultra-compact micro-header: label on left, + Line / - Line on right */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 4,
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                }}>
                <span style={{ fontWeight: 600 }}>
                    Roll pattern{' '}
                    <span style={{ opacity: 0.75, fontWeight: 400 }}>
                        (tap dots, A/B pitch, or steps)
                    </span>
                </span>
                <div style={{ display: 'inline-flex', gap: 4 }}>
                    <button
                        type="button"
                        disabled={tracks.length <= 1}
                        onClick={onRemoveTrack}
                        title="Remove bottom track line"
                        style={{
                            padding: '1px 6px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            borderRadius: 4,
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-primary)',
                            color: 'var(--text-primary)',
                            opacity: tracks.length <= 1 ? 0.35 : 1,
                            cursor: tracks.length <= 1 ? 'default' : 'pointer',
                        }}>
                        - Line
                    </button>
                    <button
                        type="button"
                        disabled={tracks.length >= 4}
                        onClick={onAddTrack}
                        title="Add polyrhythm track line (up to 4)"
                        style={{
                            padding: '1px 6px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            borderRadius: 4,
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-primary)',
                            color: 'var(--text-primary)',
                            opacity: tracks.length >= 4 ? 0.35 : 1,
                            cursor: tracks.length >= 4 ? 'default' : 'pointer',
                        }}>
                        + Line
                    </button>
                </div>
            </div>

            {/* Roll Tracks Box */}
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 5,
                    padding: '7px',
                    borderRadius: 8,
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                }}>
                {tracks.map((track, trackIdx) => {
                    const palette =
                        TRACK_COLORS[track.voice] ||
                        (trackIdx === 0 ? TRACK_COLORS.high : TRACK_COLORS.low);
                    const activeStepIdx = isPlaying
                        ? (currentStepByTrack[trackIdx] ?? -1)
                        : -1;
                    const numSteps = track.steps.length;

                    return (
                        <div
                            key={track.id || trackIdx}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 5,
                            }}>
                            {/* Clickable Voice Pitch Badge (A / B / C / D) */}
                            <button
                                type="button"
                                onClick={() =>
                                    onCycleTrackVoice && onCycleTrackVoice(trackIdx)
                                }
                                title={`Track ${track.label} (${palette.name}) — tap to cycle click pitch`}
                                style={{
                                    width: 22,
                                    height: 26,
                                    padding: 0,
                                    borderRadius: 5,
                                    border: `1px solid ${palette.activeBorder}`,
                                    background: palette.badgeBg,
                                    color: palette.badgeText,
                                    fontWeight: 800,
                                    fontSize: '0.72rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                    cursor: 'pointer',
                                    userSelect: 'none',
                                }}>
                                {track.label || String.fromCharCode(65 + trackIdx)}
                            </button>

                            {/* Horizontal Time Loop Blocks (Constant 26px height, proportional width) */}
                            <div
                                style={{
                                    display: 'flex',
                                    flex: 1,
                                    gap: numSteps >= 12 ? 2 : 3,
                                    minWidth: 0,
                                }}>
                                {track.steps.map((hasDot, stepIdx) => {
                                    const isPlayheadHere = activeStepIdx === stepIdx;
                                    const isBeatBoundary =
                                        numSteps >= 8 &&
                                        numSteps % 4 === 0 &&
                                        stepIdx > 0 &&
                                        stepIdx % (numSteps / 4) === 0;

                                    return (
                                        <button
                                            key={stepIdx}
                                            type="button"
                                            title={`Track ${track.label}, Step ${stepIdx + 1}/${numSteps}`}
                                            onClick={() =>
                                                onToggleStep &&
                                                onToggleStep(trackIdx, stepIdx)
                                            }
                                            style={{
                                                flex: 1,
                                                height: 26,
                                                padding: 0,
                                                marginLeft: isBeatBoundary ? 2 : 0,
                                                borderRadius: 4,
                                                border: `1px solid ${
                                                    isPlayheadHere
                                                        ? palette.activeBorder
                                                        : 'var(--border-color)'
                                                }`,
                                                background: isPlayheadHere
                                                    ? palette.activeBg
                                                    : 'var(--bg-surface)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer',
                                                transition: 'background 0.05s ease',
                                            }}>
                                            <span
                                                style={{
                                                    width: numSteps >= 12 ? 5.5 : 7.5,
                                                    height: numSteps >= 12 ? 5.5 : 7.5,
                                                    borderRadius: '50%',
                                                    background: hasDot
                                                        ? palette.dot
                                                        : 'var(--border-color)',
                                                    opacity: hasDot ? 1 : 0.32,
                                                    transform:
                                                        isPlayheadHere && hasDot
                                                            ? 'scale(1.25)'
                                                            : 'scale(1)',
                                                    transition: 'transform 0.05s ease',
                                                }}
                                            />
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Compact Right-Edge Step Count Stepper ([- N +]) */}
                            <div
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    height: 26,
                                    borderRadius: 5,
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--bg-surface)',
                                    flexShrink: 0,
                                    overflow: 'hidden',
                                }}>
                                <button
                                    type="button"
                                    disabled={numSteps <= 1}
                                    onClick={() =>
                                        onChangeTrackSteps &&
                                        onChangeTrackSteps(trackIdx, numSteps - 1)
                                    }
                                    title="Fewer subdivisions on this line"
                                    style={{
                                        width: 15,
                                        height: '100%',
                                        padding: 0,
                                        border: 'none',
                                        background: 'transparent',
                                        color: 'var(--text-secondary)',
                                        fontWeight: 800,
                                        fontSize: '0.75rem',
                                        cursor: numSteps <= 1 ? 'default' : 'pointer',
                                        opacity: numSteps <= 1 ? 0.3 : 1,
                                    }}>
                                    -
                                </button>
                                <span
                                    title={`${numSteps} steps in bar`}
                                    style={{
                                        minWidth: 16,
                                        textAlign: 'center',
                                        fontSize: '0.7rem',
                                        fontWeight: 800,
                                        color: 'var(--text-primary)',
                                        userSelect: 'none',
                                    }}>
                                    {numSteps}
                                </span>
                                <button
                                    type="button"
                                    disabled={numSteps >= 16}
                                    onClick={() =>
                                        onChangeTrackSteps &&
                                        onChangeTrackSteps(trackIdx, numSteps + 1)
                                    }
                                    title="More subdivisions on this line"
                                    style={{
                                        width: 15,
                                        height: '100%',
                                        padding: 0,
                                        border: 'none',
                                        background: 'transparent',
                                        color: 'var(--text-secondary)',
                                        fontWeight: 800,
                                        fontSize: '0.75rem',
                                        cursor: numSteps >= 16 ? 'default' : 'pointer',
                                        opacity: numSteps >= 16 ? 0.3 : 1,
                                    }}>
                                    +
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
