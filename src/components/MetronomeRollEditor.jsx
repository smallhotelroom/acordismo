/**
 * @file src/components/MetronomeRollEditor.jsx
 * @version 2.3.1
 * Multi-View Polyrhythm Roll Editor for the Acordismo Metronome:
 * - Top Control Bar: [ Circular | Landscape | Portrait ] view selector (defaults to Circular) + [ - Line | + Line ]
 * - Theme-aware Track Palettes: Track A ('high') follows `--accent-color`, Track B ('mid') uses the complementary
 *   Blue/Green, and Track D+ ('sub') uses warm Brown in Small Hotel Room mode vs Purple in Basic mode.
 * - Smart Auto-Switch between Landscape and Portrait when cell dimensions get too small.
 */
import React, { useContext, useState } from 'react';
import { AppContext } from '../shared/AppContext';
import {
    MAX_METRONOME_STEPS,
    MAX_METRONOME_TRACKS,
} from '../shared/audioEngine';

export const __version__ = '2.3.1';

const VIEW_MODE_STORAGE_KEY = 'acordismo_metronome_view_mode';
const LANDSCAPE_MAX_COMFORTABLE_STEPS = 16;
const PORTRAIT_MAX_COMFORTABLE_TRACKS = 5;
const MIN_CELL_SIZE_PX = 26;

function getTrackPalette(track, trackIdx, colorTheme = 'basic') {
    const isShr = colorTheme === 'shr';
    const palettes = {
        high: {
            name: 'High pitch (Downbeat)',
            dot: 'var(--accent-color)',
            activeBg: 'rgba(var(--accent-rgb, 37, 99, 235), 0.25)',
            activeBorder: 'var(--accent-color)',
            badgeBg: 'rgba(var(--accent-rgb, 37, 99, 235), 0.15)',
            badgeText: 'var(--accent-color)',
        },
        mid: isShr
            ? {
                  name: 'Mid pitch (Quarter pulse)',
                  dot: '#0969da',
                  activeBg: 'rgba(9, 105, 218, 0.24)',
                  activeBorder: '#0969da',
                  badgeBg: 'rgba(9, 105, 218, 0.15)',
                  badgeText: '#0969da',
              }
            : {
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
        sub: isShr
            ? {
                  name: 'Sub pitch (Polyrhythm)',
                  dot: '#a16207',
                  activeBg: 'rgba(161, 98, 7, 0.25)',
                  activeBorder: '#a16207',
                  badgeBg: 'rgba(161, 98, 7, 0.16)',
                  badgeText: '#a16207',
              }
            : {
                  name: 'Sub pitch (Polyrhythm)',
                  dot: '#a855f7',
                  activeBg: 'rgba(168, 85, 247, 0.25)',
                  activeBorder: '#a855f7',
                  badgeBg: 'rgba(168, 85, 247, 0.16)',
                  badgeText: '#a855f7',
              },
    };

    if (track?.voice && palettes[track.voice]) {
        return palettes[track.voice];
    }
    const keys = ['high', 'mid', 'low', 'sub'];
    return palettes[keys[trackIdx % keys.length]];
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
    const appCtx = useContext(AppContext);
    const colorTheme = appCtx?.colorTheme || 'basic';

    const [viewMode, setViewModeState] = useState(() => {
        if (typeof localStorage !== 'undefined') {
            const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
            if (
                saved === 'circular' ||
                saved === 'horizontal' ||
                saved === 'vertical'
            ) {
                return saved;
            }
        }
        return 'circular';
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

    const handleStepCountChangeWithAutoFit = (trackIdx, nextSteps) => {
        if (onChangeTrackSteps) {
            onChangeTrackSteps(trackIdx, nextSteps);
        }
        const otherMaxSteps = tracks.reduce(
            (max, t, idx) => (idx === trackIdx ? max : Math.max(max, t.steps.length)),
            0
        );
        const newMaxSteps = Math.max(otherMaxSteps, nextSteps);

        if (
            viewMode === 'horizontal' &&
            newMaxSteps > LANDSCAPE_MAX_COMFORTABLE_STEPS
        ) {
            setViewMode('vertical');
        } else if (
            viewMode === 'vertical' &&
            newMaxSteps <= LANDSCAPE_MAX_COMFORTABLE_STEPS &&
            tracks.length > PORTRAIT_MAX_COMFORTABLE_TRACKS
        ) {
            setViewMode('horizontal');
        }
    };

    const handleAddTrackWithAutoFit = () => {
        const nextTrackCount = tracks.length + 1;
        const maxSteps = Math.max(...tracks.map((t) => t.steps.length), 4);
        if (onAddTrack) {
            onAddTrack();
        }
        if (
            viewMode === 'vertical' &&
            nextTrackCount > PORTRAIT_MAX_COMFORTABLE_TRACKS &&
            maxSteps <= LANDSCAPE_MAX_COMFORTABLE_STEPS
        ) {
            setViewMode('horizontal');
        }
    };

    // --- 1. CIRCULAR VIEW ---
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
                        const palette = getTrackPalette(track, trackIdx, colorTheme);
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

                <div
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                        gap: 6,
                        width: '100%',
                    }}>
                    {tracks.map((track, trackIdx) => {
                        const palette = getTrackPalette(track, trackIdx, colorTheme);
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
                                    onChangeTrackSteps={
                                        handleStepCountChangeWithAutoFit
                                    }
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // --- 2. LANDSCAPE VIEW ---
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
                const palette = getTrackPalette(track, trackIdx, colorTheme);
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
                        <button
                            type="button"
                            onClick={() =>
                                onCycleTrackVoice && onCycleTrackVoice(trackIdx)
                            }
                            title={`Track ${track.label} (${palette.name}) — tap to cycle click voice`}
                            style={{
                                width: 22,
                                height: MIN_CELL_SIZE_PX,
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

                        <div
                            style={{
                                display: 'flex',
                                flex: 1,
                                gap: numSteps >= 16 ? 1.5 : numSteps >= 12 ? 2 : 3,
                                minWidth:
                                    numSteps > LANDSCAPE_MAX_COMFORTABLE_STEPS
                                        ? numSteps * 18
                                        : 0,
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
                                            height: MIN_CELL_SIZE_PX,
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
                            onChangeTrackSteps={
                                handleStepCountChangeWithAutoFit
                            }
                        />
                    </div>
                );
            })}
        </div>
    );

    // --- 3. TRANSPOSED PORTRAIT VIEW ---
    const renderVerticalView = () => {
        const maxStepsAcrossTracks = Math.max(
            ...tracks.map((t) => t.steps.length),
            4
        );
        const colHeight = Math.max(
            140,
            maxStepsAcrossTracks * (MIN_CELL_SIZE_PX + 2.5)
        );

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
                    const palette = getTrackPalette(track, trackIdx, colorTheme);
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
                                minWidth: 54,
                                maxWidth: 92,
                            }}>
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
                                    onChangeTrackSteps={
                                        handleStepCountChangeWithAutoFit
                                    }
                                />
                            </div>

                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    width: '100%',
                                    height: colHeight,
                                    gap: 2.5,
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
                                                minHeight: MIN_CELL_SIZE_PX - 2,
                                                width: '100%',
                                                padding: 0,
                                                marginTop: isBeatBoundary
                                                    ? 3
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
                                                    width: 7,
                                                    height: 7,
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
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 6,
                    marginBottom: 6,
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
                        {
                            id: 'circular',
                            label: 'Circular',
                            title: 'Circular Euclidean Necklace (Clockwise)',
                        },
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
                        onClick={handleAddTrackWithAutoFit}
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
                : viewMode === 'horizontal'
                  ? renderHorizontalView()
                  : renderCircularView()}
        </div>
    );
}
