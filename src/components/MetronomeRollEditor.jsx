/**
 * @file src/components/MetronomeRollEditor.jsx
 * @version 2.1.0
 * Multi-View Polyrhythm Roll Editor for the Acordismo Metronome:
 * - Top Control Bar: [ Landscape | Portrait | Circular ] view selector + [ - Line | + Line ]
 * - Mode 1 ('horizontal' / Landscape): Horizontal tracks, time flows left-to-right.
 * - Mode 2 ('vertical'   / Portrait):  Transposed columns (A | B | C...), time flows top-to-bottom.
 * - Mode 3 ('circular'   / Circular):  Concentric Euclidean rhythm rings, time orbits clockwise from 12 o'clock.
 */
import React, { useState } from 'react';
import {
    MAX_METRONOME_STEPS,
    MAX_METRONOME_TRACKS,
} from '../shared/audioEngine';

export const __version__ = '2.1.0';

const VIEW_MODE_STORAGE_KEY = 'acordismo_metronome_view_mode';

const TRACK_COLORS = {
    high: {
        name: 'High pitch (Downbeat)',
        dot: '#2563eb',
        activeBg: 'rgba(37, 99, 235, 0.25)',
        activeBorder: '#2563eb',
        badgeBg: 'rgba(37, 99, 235, 0.15)',
        badgeText: '#2563eb',
    },
    mid: {
        name: 'Mid pitch (Quarter pulse)',
        dot: '#10b981',
        activeBg: 'rgba(16, 185, 129, 0.25)',
        activeBorder: '#10b981',
        badgeBg: 'rgba(16, 185, 129, 0.16)',
        badgeText: '#10b981',
    },
    low: {
        name: 'Low pitch (Subdivision)',
        dot: '#f59e0b',
        activeBg: 'rgba(245, 158, 11, 0.25)',
        activeBorder: '#f59e0b',
        badgeBg: 'rgba(245, 158, 11, 0.16)',
        badgeText: '#f59e0b',
    },
    sub: {
        name: 'Sub pitch (Polyrhythm)',
        dot: '#a855f7',
        activeBg: 'rgba(168, 85, 247, 0.25)',
        activeBorder: '#a855f7',
        badgeBg: 'rgba(168, 85, 247, 0.16)',
        badgeText: '#a855f7',
    },
};

function getTrackPalette(track, trackIdx) {
    if (track?.voice && TRACK_COLORS[track.voice]) {
        return TRACK_COLORS[track.voice];
    }
    const keys = ['high', 'mid', 'low', 'sub'];
    return TRACK_COLORS[keys[trackIdx % keys.length]];
}

function StepCounterPill({ numSteps, trackIdx, onChangeTrackSteps }) {
    return (
        <div
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: 24,
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
                title="Fewer subdivisions"
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
                title={`${numSteps} steps in cycle`}
                style={{
                    minWidth: 16,
                    textAlign: 'center',
                    fontSize: '0.69rem',
                    fontWeight: 800,
                    color: 'var(--text-primary)',
                    userSelect: 'none',
                }}>
                {numSteps}
            </span>
            <button
                type="button"
                disabled={numSteps >= MAX_METRONOME_STEPS}
                onClick={() =>
                    onChangeTrackSteps &&
                    onChangeTrackSteps(trackIdx, numSteps + 1)
                }
                title="More subdivisions"
                style={{
                    width: 15,
                    height: '100%',
                    padding: 0,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    fontWeight: 800,
                    fontSize: '0.75rem',
                    cursor:
                        numSteps >= MAX_METRONOME_STEPS ? 'default' : 'pointer',
                    opacity: numSteps >= MAX_METRONOME_STEPS ? 0.3 : 1,
                }}>
                +
            </button>
        </div>
    );
}

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
    const [viewMode, setViewModeState] = useState(() => {
        if (typeof localStorage !== 'undefined') {
            const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
            if (
                saved === 'horizontal' ||
                saved === 'vertical' ||
                saved === 'circular'
            ) {
                return saved;
            }
        }
        return 'horizontal';
    });

    const setViewMode = (mode) => {
        setViewModeState(mode);
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
        }
    };

    if (!Array.isArray(tracks) || tracks.length === 0) {
        return null;
    }

    const masterBeats = tracks[0]?.steps?.length || 4;

    // --- 2.1 LANDSCAPE VIEW (Horizontal rows, left-to-right time) ---
    const renderHorizontalView = () => (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
                padding: '7px',
                borderRadius: 8,
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                overflowX: 'auto',
            }}>
            {tracks.map((track, trackIdx) => {
                const palette = getTrackPalette(track, trackIdx);
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
                        {/* Voice Pitch Badge (A / B / C...) */}
                        <button
                            type="button"
                            onClick={() =>
                                onCycleTrackVoice && onCycleTrackVoice(trackIdx)
                            }
                            title={`Track ${track.label} (${palette.name}) — tap to cycle click voice`}
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

                        {/* Horizontal Time Loop Blocks */}
                        <div
                            style={{
                                display: 'flex',
                                flex: 1,
                                gap: numSteps >= 16 ? 1.5 : numSteps >= 12 ? 2 : 3,
                                minWidth: numSteps > 16 ? numSteps * 15 : 0,
                            }}>
                            {track.steps.map((hasDot, stepIdx) => {
                                const isPlayheadHere = activeStepIdx === stepIdx;
                                const isBeatBoundary =
                                    numSteps > masterBeats &&
                                    numSteps % masterBeats === 0 &&
                                    stepIdx > 0 &&
                                    stepIdx % (numSteps / masterBeats) === 0;

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
                                        }}>
                                        <span
                                            style={{
                                                width:
                                                    numSteps >= 20
                                                        ? 4.5
                                                        : numSteps >= 12
                                                          ? 5.5
                                                          : 7.5,
                                                height:
                                                    numSteps >= 20
                                                        ? 4.5
                                                        : numSteps >= 12
                                                          ? 5.5
                                                          : 7.5,
                                                borderRadius: '50%',
                                                background: hasDot
                                                    ? palette.dot
                                                    : 'var(--border-color)',
                                                opacity: hasDot ? 1 : 0.32,
                                                transform:
                                                    isPlayheadHere && hasDot
                                                        ? 'scale(1.25)'
                                                        : 'scale(1)',
                                            }}
                                        />
                                    </button>
                                );
                            })}
                        </div>

                        <StepCounterPill
                            numSteps={numSteps}
                            trackIdx={trackIdx}
                            onChangeTrackSteps={onChangeTrackSteps}
                        />
                    </div>
                );
            })}
        </div>
    );

    // --- 2.2 TRANSPOSED PORTRAIT VIEW (Vertical columns, top-to-bottom time) ---
    const renderVerticalView = () => {
        const maxStepsAcrossTracks = Math.max(
            ...tracks.map((t) => t.steps.length),
            4
        );
        const colHeight = Math.max(180, Math.min(340, maxStepsAcrossTracks * 18));

        return (
            <div
                style={{
                    display: 'flex',
                    gap: 8,
                    padding: '8px',
                    borderRadius: 8,
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    overflowX: 'auto',
                    justifyContent:
                        tracks.length <= 4 ? 'space-around' : 'flex-start',
                }}>
                {tracks.map((track, trackIdx) => {
                    const palette = getTrackPalette(track, trackIdx);
                    const activeStepIdx = isPlaying
                        ? (currentStepByTrack[trackIdx] ?? -1)
                        : -1;
                    const numSteps = track.steps.length;

                    return (
                        <div
                            key={track.id || trackIdx}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 5,
                                flex: 1,
                                minWidth: 52,
                                maxWidth: 88,
                            }}>
                            {/* Top Header: Track Badge + Step Counter */}
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                }}>
                                <button
                                    type="button"
                                    onClick={() =>
                                        onCycleTrackVoice &&
                                        onCycleTrackVoice(trackIdx)
                                    }
                                    title={`Track ${track.label} (${palette.name}) — tap to cycle click voice`}
                                    style={{
                                        width: 22,
                                        height: 24,
                                        padding: 0,
                                        borderRadius: 5,
                                        border: `1px solid ${palette.activeBorder}`,
                                        background: palette.badgeBg,
                                        color: palette.badgeText,
                                        fontWeight: 800,
                                        fontSize: '0.72rem',
                                        cursor: 'pointer',
                                    }}>
                                    {track.label ||
                                        String.fromCharCode(65 + trackIdx)}
                                </button>
                                <StepCounterPill
                                    numSteps={numSteps}
                                    trackIdx={trackIdx}
                                    onChangeTrackSteps={onChangeTrackSteps}
                                />
                            </div>

                            {/* Vertical Time Column (Top-to-Bottom proportional blocks) */}
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    width: '100%',
                                    height: colHeight,
                                    gap: numSteps >= 16 ? 1.5 : 2.5,
                                }}>
                                {track.steps.map((hasDot, stepIdx) => {
                                    const isPlayheadHere =
                                        activeStepIdx === stepIdx;
                                    const isBeatBoundary =
                                        numSteps > masterBeats &&
                                        numSteps % masterBeats === 0 &&
                                        stepIdx > 0 &&
                                        stepIdx % (numSteps / masterBeats) === 0;

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
                                                width: '100%',
                                                padding: 0,
                                                marginTop: isBeatBoundary
                                                    ? 2
                                                    : 0,
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
                                            }}>
                                            <span
                                                style={{
                                                    width:
                                                        numSteps >= 20
                                                            ? 5
                                                            : 7,
                                                    height:
                                                        numSteps >= 20
                                                            ? 5
                                                            : 7,
                                                    borderRadius: '50%',
                                                    background: hasDot
                                                        ? palette.dot
                                                        : 'var(--border-color)',
                                                    opacity: hasDot ? 1 : 0.32,
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
    };

    // --- 2.3 CIRCULAR VIEW (Concentric Euclidean Rhythm Necklace, clockwise from 12 o'clock) ---
    const renderCircularView = () => {
        const size = 224;
        const cx = size / 2;
        const cy = size / 2;
        const outerRadius = 92;
        const minInnerRadius = 32;
        const ringCount = tracks.length;
        const ringStep =
            ringCount > 1
                ? Math.min(24, (outerRadius - minInnerRadius) / (ringCount - 1))
                : 0;

        return (
            <div
                style={{
                    padding: '8px',
                    borderRadius: 8,
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                }}>
                <svg
                    width={size}
                    height={size}
                    viewBox={`0 0 ${size} ${size}`}
                    style={{ overflow: 'visible', userSelect: 'none' }}>
                    {/* 12 o'clock Downbeat Tick Mark */}
                    <line
                        x1={cx}
                        y1={cy - outerRadius - 12}
                        x2={cx}
                        y2={cy - outerRadius - 5}
                        stroke="var(--text-secondary)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        opacity="0.6"
                    />

                    {tracks.map((track, trackIdx) => {
                        const palette = getTrackPalette(track, trackIdx);
                        const r = outerRadius - trackIdx * ringStep;
                        const numSteps = Math.max(1, track.steps.length);
                        const activeStepIdx = isPlaying
                            ? (currentStepByTrack[trackIdx] ?? -1)
                            : -1;

                        const nodeRadius =
                            numSteps >= 24
                                ? 4.2
                                : numSteps >= 16
                                  ? 5.2
                                  : numSteps >= 12
                                    ? 6.2
                                    : 7.5;

                        const activeCoords = [];
                        const stepCoords = track.steps.map((hasDot, stepIdx) => {
                            const angleRad =
                                (stepIdx / numSteps) * Math.PI * 2 -
                                Math.PI / 2;
                            const x = cx + r * Math.cos(angleRad);
                            const y = cy + r * Math.sin(angleRad);
                            if (hasDot) {
                                activeCoords.push(`${x.toFixed(1)},${y.toFixed(1)}`);
                            }
                            return { x, y, hasDot, stepIdx, angleRad };
                        });

                        const playheadCoord =
                            activeStepIdx >= 0 && stepCoords[activeStepIdx]
                                ? stepCoords[activeStepIdx]
                                : null;

                        return (
                            <g key={track.id || trackIdx}>
                                {/* Base Concentric Track Ring */}
                                <circle
                                    cx={cx}
                                    cy={cy}
                                    r={r}
                                    fill="none"
                                    stroke="var(--border-color)"
                                    strokeWidth="1.25"
                                    strokeDasharray={
                                        trackIdx > 0 ? '2 2' : undefined
                                    }
                                />

                                {/* Subtle Euclidean Polygon connecting active beats when >= 3 dots */}
                                {activeCoords.length >= 3 && (
                                    <polygon
                                        points={activeCoords.join(' ')}
                                        fill={palette.activeBg}
                                        fillOpacity="0.18"
                                        stroke={palette.dot}
                                        strokeWidth="1"
                                        strokeOpacity="0.35"
                                        style={{ pointerEvents: 'none' }}
                                    />
                                )}

                                {/* Rotating Playhead Hand from center to current step on outer track */}
                                {playheadCoord && trackIdx === 0 && (
                                    <line
                                        x1={cx}
                                        y1={cy}
                                        x2={playheadCoord.x}
                                        y2={playheadCoord.y}
                                        stroke={palette.dot}
                                        strokeWidth="1.5"
                                        strokeOpacity="0.45"
                                        style={{ pointerEvents: 'none' }}
                                    />
                                )}

                                {/* Interactive Step Nodes around the Ring */}
                                {stepCoords.map(({ x, y, hasDot, stepIdx }) => {
                                    const isPlayheadHere =
                                        activeStepIdx === stepIdx;
                                    return (
                                        <g
                                            key={stepIdx}
                                            style={{ cursor: 'pointer' }}
                                            onClick={() =>
                                                onToggleStep &&
                                                onToggleStep(trackIdx, stepIdx)
                                            }>
                                            <circle
                                                cx={x}
                                                cy={y}
                                                r={Math.max(10, nodeRadius + 3)}
                                                fill="transparent"
                                            />
                                            {isPlayheadHere && (
                                                <circle
                                                    cx={x}
                                                    cy={y}
                                                    r={nodeRadius + 3.5}
                                                    fill="none"
                                                    stroke={palette.activeBorder}
                                                    strokeWidth="2"
                                                />
                                            )}
                                            <circle
                                                cx={x}
                                                cy={y}
                                                r={
                                                    isPlayheadHere
                                                        ? nodeRadius * 1.18
                                                        : nodeRadius
                                                }
                                                fill={
                                                    hasDot
                                                        ? palette.dot
                                                        : 'var(--bg-surface)'
                                                }
                                                stroke={
                                                    hasDot
                                                        ? palette.activeBorder
                                                        : 'var(--border-color)'
                                                }
                                                strokeWidth="1.5"
                                            />
                                        </g>
                                    );
                                })}
                            </g>
                        );
                    })}

                    {/* Center Hub Label */}
                    <circle
                        cx={cx}
                        cy={cy}
                        r="16"
                        fill="var(--bg-surface)"
                        stroke="var(--border-color)"
                        strokeWidth="1.2"
                    />
                    <text
                        x={cx}
                        y={cy + 3.5}
                        textAnchor="middle"
                        fontSize="9.5"
                        fontWeight="800"
                        fill="var(--text-secondary)">
                        {tracks.map((t) => t.steps.length).join(':')}
                    </text>
                </svg>

                {/* Compact Track Legend & Step Counters Below the Wheel */}
                <div
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                        gap: 6,
                        width: '100%',
                    }}>
                    {tracks.map((track, trackIdx) => {
                        const palette = getTrackPalette(track, trackIdx);
                        return (
                            <div
                                key={track.id || trackIdx}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3,
                                }}>
                                <button
                                    type="button"
                                    onClick={() =>
                                        onCycleTrackVoice &&
                                        onCycleTrackVoice(trackIdx)
                                    }
                                    title={`Track ${track.label} (${palette.name}) — tap to cycle click voice`}
                                    style={{
                                        width: 22,
                                        height: 24,
                                        padding: 0,
                                        borderRadius: 5,
                                        border: `1px solid ${palette.activeBorder}`,
                                        background: palette.badgeBg,
                                        color: palette.badgeText,
                                        fontWeight: 800,
                                        fontSize: '0.72rem',
                                        cursor: 'pointer',
                                    }}>
                                    {track.label ||
                                        String.fromCharCode(65 + trackIdx)}
                                </button>
                                <StepCounterPill
                                    numSteps={track.steps.length}
                                    trackIdx={trackIdx}
                                    onChangeTrackSteps={onChangeTrackSteps}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div>
            {/* Top Bar: Clickable [ Landscape | Portrait | Circular ] on Left + [ - Line | + Line ] on Right */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 6,
                    marginBottom: 6,
                }}>
                {/* 3-Mode Visual Switcher with explicit labels */}
                <div
                    style={{
                        display: 'inline-flex',
                        background: 'var(--bg-primary)',
                        padding: 2,
                        borderRadius: 6,
                        border: '1px solid var(--border-color)',
                    }}>
                    {[
                        {
                            id: 'horizontal',
                            label: 'Landscape',
                            title: 'Landscape Roll (Left → Right)',
                        },
                        {
                            id: 'vertical',
                            label: 'Portrait',
                            title: 'Portrait Roll (Top → Bottom)',
                        },
                        {
                            id: 'circular',
                            label: 'Circular',
                            title: 'Circular Euclidean Necklace (Clockwise)',
                        },
                    ].map((m) => {
                        const active = viewMode === m.id;
                        return (
                            <button
                                key={m.id}
                                type="button"
                                title={m.title}
                                onClick={() => setViewMode(m.id)}
                                style={{
                                    padding: '4px 9px',
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    borderRadius: 4,
                                    border: 'none',
                                    background: active
                                        ? 'var(--accent-color)'
                                        : 'transparent',
                                    color: active
                                        ? '#ffffff'
                                        : 'var(--text-secondary)',
                                    cursor: 'pointer',
                                }}>
                                {m.label}
                            </button>
                        );
                    })}
                </div>

                {/* - Line / + Line */}
                <div style={{ display: 'inline-flex', gap: 4 }}>
                    <button
                        type="button"
                        disabled={tracks.length <= 1}
                        onClick={onRemoveTrack}
                        title="Remove bottom track line"
                        style={{
                            padding: '4px 8px',
                            fontSize: '0.73rem',
                            fontWeight: 700,
                            borderRadius: 6,
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
                        disabled={tracks.length >= MAX_METRONOME_TRACKS}
                        onClick={onAddTrack}
                        title="Add polyrhythm track line"
                        style={{
                            padding: '4px 8px',
                            fontSize: '0.73rem',
                            fontWeight: 700,
                            borderRadius: 6,
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-primary)',
                            color: 'var(--text-primary)',
                            opacity:
                                tracks.length >= MAX_METRONOME_TRACKS
                                    ? 0.35
                                    : 1,
                            cursor:
                                tracks.length >= MAX_METRONOME_TRACKS
                                    ? 'default'
                                    : 'pointer',
                        }}>
                        + Line
                    </button>
                </div>
            </div>

            {viewMode === 'vertical'
                ? renderVerticalView()
                : viewMode === 'circular'
                  ? renderCircularView()
                  : renderHorizontalView()}
        </div>
    );
}
