/**
 * @file src/components/MetronomeRollEditor.jsx
 * @version 1.0.0
 * Compact horizontal block/line roll editor for the Acordismo Metronome.
 * - Each horizontal row represents a distinct click voice (Track A = high accent, Track B = low subdivision).
 * - Time loops left-to-right across the bar; each block has constant height (26px) and proportional
 *   width (`flex: 1` per step in that track, ready for N-line polyrhythms with independent divisions per line).
 * - Tapping any block toggles its dot on/off in real time.
 */
import React from 'react';

export const __version__ = '1.0.0';

const TRACK_COLORS = {
    high: {
        dot: '#2563eb',
        activeBg: 'rgba(37, 99, 235, 0.24)',
        activeBorder: '#2563eb',
        badgeBg: 'rgba(37, 99, 235, 0.14)',
        badgeText: '#2563eb',
    },
    low: {
        dot: '#f59e0b',
        activeBg: 'rgba(245, 158, 11, 0.24)',
        activeBorder: '#f59e0b',
        badgeBg: 'rgba(245, 158, 11, 0.16)',
        badgeText: '#f59e0b',
    },
};

export default function MetronomeRollEditor({
    tracks = [],
    currentStepByTrack = [],
    isPlaying = false,
    onToggleStep,
}) {
    if (!Array.isArray(tracks) || tracks.length === 0) {
        return null;
    }

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
                padding: '8px',
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
                            gap: 6,
                        }}>
                        {/* Track Voice Label (A / B) */}
                        <div
                            title={
                                trackIdx === 0
                                    ? 'Track A (Primary pulse click)'
                                    : 'Track B (Subdivision click)'
                            }
                            style={{
                                width: 20,
                                height: 26,
                                borderRadius: 5,
                                background: palette.badgeBg,
                                color: palette.badgeText,
                                fontWeight: 800,
                                fontSize: '0.72rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                userSelect: 'none',
                            }}>
                            {track.label || String.fromCharCode(65 + trackIdx)}
                        </div>

                        {/* Horizontal Time Loop Blocks (Constant height, proportional width per step) */}
                        <div
                            style={{
                                display: 'flex',
                                flex: 1,
                                gap: numSteps >= 16 ? 2 : 4,
                                minWidth: 0,
                            }}>
                            {track.steps.map((hasDot, stepIdx) => {
                                const isPlayheadHere = activeStepIdx === stepIdx;
                                // Subtle quarter-beat grouping marker when in 8 or 16 steps
                                const isBeatBoundary =
                                    numSteps > 4 &&
                                    stepIdx > 0 &&
                                    stepIdx % (numSteps / 4) === 0;

                                return (
                                    <button
                                        key={stepIdx}
                                        type="button"
                                        title={`Track ${track.label || trackIdx + 1}, Step ${stepIdx + 1}/${numSteps}`}
                                        onClick={() =>
                                            onToggleStep &&
                                            onToggleStep(trackIdx, stepIdx)
                                        }
                                        style={{
                                            flex: 1,
                                            height: 26,
                                            padding: 0,
                                            marginLeft: isBeatBoundary ? 2 : 0,
                                            borderRadius: 5,
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
                                                width: numSteps >= 16 ? 6 : 8,
                                                height: numSteps >= 16 ? 6 : 8,
                                                borderRadius: '50%',
                                                background: hasDot
                                                    ? palette.dot
                                                    : 'var(--border-color)',
                                                opacity: hasDot ? 1 : 0.35,
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
                    </div>
                );
            })}
        </div>
    );
}
