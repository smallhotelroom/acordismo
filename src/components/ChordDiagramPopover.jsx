/**
 * @file src/components/ChordDiagramPopover.jsx
 * @version 1.1.0
 * Floating fretboard neck diagram overlay for Guitar (6 strings) and Ukulele (4 strings).
 * Supports song-specific `## Chords` / `## Fingerings` postures, Guitar/Ukulele toggle, and Strum button.
 */
import React, { useMemo } from 'react';
import { Volume2, X } from 'lucide-react';
import { getChordDiagramData } from '../shared/chordDiagrams';
import { playPolyphonicChord } from '../shared/audioEngine';

export const __version__ = '1.1.0';

export default function ChordDiagramPopover({
    chordStr,
    instrument = 'guitar',
    customVoicings = null,
    onSelectInstrument,
    onClose,
}) {
    const diagram = useMemo(
        () => getChordDiagramData(chordStr, instrument, customVoicings),
        [chordStr, instrument, customVoicings]
    );

    if (!diagram) {
        return null;
    }

    const {
        frets,
        baseFret,
        barre,
        stringNames,
        frequencies,
        isSongSpecific,
        customLabel,
    } = diagram;
    const numStrings = frets.length;
    const numFrets = 4;

    const svgWidth = numStrings === 6 ? 190 : 154;
    const svgHeight = 195;
    const padLeft = 28;
    const padRight = 20;
    const padTop = 34;
    const padBottom = 26;

    const gridW = svgWidth - padLeft - padRight;
    const gridH = svgHeight - padTop - padBottom;
    const stringSpacing = gridW / (numStrings - 1);
    const fretSpacing = gridH / numFrets;

    const getStringX = (sIdx) => padLeft + sIdx * stringSpacing;
    const getFretY = (fIdx) => padTop + fIdx * fretSpacing;

    const handleStrum = () => {
        if (frequencies.length > 0) {
            playPolyphonicChord(frequencies, { mode: 'natural', duration: 2.2 });
        }
    };

    return (
        <div
            className="modal-backdrop"
            style={{ zIndex: 25000, background: 'rgba(0, 0, 0, 0.45)' }}
            onClick={onClose}>
            <div
                className="modal-card"
                style={{
                    maxWidth: 270,
                    padding: '14px 16px 16px 16px',
                    borderRadius: 12,
                    textAlign: 'center',
                }}
                onClick={(e) => e.stopPropagation()}>
                {/* Header: Chord Title + Close Button */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: isSongSpecific ? 4 : 10,
                    }}>
                    <div
                        style={{
                            fontSize: '1.35rem',
                            fontWeight: 800,
                            color: 'var(--accent-color)',
                        }}>
                        {chordStr}
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

                {isSongSpecific && (
                    <div
                        style={{
                            fontSize: '0.76rem',
                            fontWeight: 700,
                            color: '#f59e0b',
                            marginBottom: 8,
                            textAlign: 'left',
                        }}>
                        ★ {customLabel}
                    </div>
                )}

                {/* Instrument Switcher: Guitar | Ukulele */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 6,
                        marginBottom: 10,
                        background: 'var(--bg-primary)',
                        padding: 4,
                        borderRadius: 8,
                        border: '1px solid var(--border-color)',
                    }}>
                    {[
                        { id: 'guitar', label: 'Guitar (6)' },
                        { id: 'ukulele', label: 'Ukulele (4)' },
                    ].map((inst) => {
                        const active = instrument === inst.id;
                        return (
                            <button
                                key={inst.id}
                                type="button"
                                onClick={() => onSelectInstrument(inst.id)}
                                style={{
                                    padding: '6px 8px',
                                    borderRadius: 6,
                                    border: 'none',
                                    fontWeight: 700,
                                    fontSize: '0.8rem',
                                    background: active
                                        ? 'var(--accent-color)'
                                        : 'transparent',
                                    color: active ? '#ffffff' : 'var(--text-secondary)',
                                    cursor: 'pointer',
                                }}>
                                {inst.label}
                            </button>
                        );
                    })}
                </div>

                {/* SVG Neck & Finger Placement Diagram */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <svg
                        width={svgWidth}
                        height={svgHeight}
                        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                        style={{ overflow: 'visible' }}>
                        {/* Top Nut (thick bar when baseFret === 1) */}
                        <line
                            x1={padLeft}
                            y1={padTop}
                            x2={padLeft + gridW}
                            y2={padTop}
                            stroke="var(--text-primary)"
                            strokeWidth={baseFret === 1 ? 5 : 1.5}
                            strokeLinecap="round"
                        />

                        {/* Base Fret Label on the left when baseFret > 1 */}
                        {baseFret > 1 && (
                            <text
                                x={padLeft - 10}
                                y={padTop + fretSpacing * 0.62}
                                textAnchor="end"
                                fill="var(--text-primary)"
                                fontSize="12"
                                fontWeight="800">
                                {baseFret}fr
                            </text>
                        )}

                        {/* Horizontal Fret Wires */}
                        {[1, 2, 3, 4].map((fIdx) => (
                            <line
                                key={`fret-${fIdx}`}
                                x1={padLeft}
                                y1={getFretY(fIdx)}
                                x2={padLeft + gridW}
                                y2={getFretY(fIdx)}
                                stroke="var(--text-secondary)"
                                strokeWidth="1.5"
                                strokeOpacity="0.65"
                            />
                        ))}

                        {/* Vertical Strings */}
                        {frets.map((_, sIdx) => (
                            <line
                                key={`str-${sIdx}`}
                                x1={getStringX(sIdx)}
                                y1={padTop}
                                x2={getStringX(sIdx)}
                                y2={padTop + gridH}
                                stroke="var(--text-primary)"
                                strokeWidth={
                                    instrument === 'guitar'
                                        ? Math.max(1.2, 2.4 - sIdx * 0.2)
                                        : 1.6
                                }
                            />
                        ))}

                        {/* Open ('O') and Muted ('X') indicators above the nut */}
                        {frets.map((fretVal, sIdx) => {
                            const cx = getStringX(sIdx);
                            const cy = padTop - 13;
                            if (fretVal === -1) {
                                return (
                                    <text
                                        key={`mute-${sIdx}`}
                                        x={cx}
                                        y={cy + 4}
                                        textAnchor="middle"
                                        fill="#ef4444"
                                        fontSize="13"
                                        fontWeight="800">
                                        ×
                                    </text>
                                );
                            }
                            if (fretVal === 0) {
                                return (
                                    <circle
                                        key={`open-${sIdx}`}
                                        cx={cx}
                                        cy={cy}
                                        r="5"
                                        fill="none"
                                        stroke="var(--text-primary)"
                                        strokeWidth="1.8"
                                    />
                                );
                            }
                            return null;
                        })}

                        {/* Optional Barre Pill */}
                        {barre && (
                            <rect
                                x={getStringX(barre.fromString) - 8}
                                y={
                                    padTop +
                                    (barre.fret - baseFret + 0.5) * fretSpacing -
                                    8
                                }
                                width={
                                    getStringX(barre.toString) -
                                    getStringX(barre.fromString) +
                                    16
                                }
                                height="16"
                                rx="8"
                                fill="var(--accent-color)"
                                opacity="0.35"
                            />
                        )}

                        {/* Fretted Finger Dots */}
                        {frets.map((fretVal, sIdx) => {
                            if (fretVal <= 0) return null;
                            const relFret = fretVal - baseFret + 1;
                            if (relFret < 1 || relFret > numFrets) return null;
                            const cx = getStringX(sIdx);
                            const cy = padTop + (relFret - 0.5) * fretSpacing;
                            return (
                                <g key={`dot-${sIdx}`}>
                                    <circle
                                        cx={cx}
                                        cy={cy}
                                        r="9.5"
                                        fill="var(--accent-color)"
                                    />
                                    <text
                                        x={cx}
                                        y={cy + 3.8}
                                        textAnchor="middle"
                                        fill="#ffffff"
                                        fontSize="10.5"
                                        fontWeight="800">
                                        {fretVal}
                                    </text>
                                </g>
                            );
                        })}

                        {/* Bottom String Tuning Labels (E A D G B e / G C E A) */}
                        {stringNames.map((sName, sIdx) => (
                            <text
                                key={`sname-${sIdx}`}
                                x={getStringX(sIdx)}
                                y={padTop + gridH + 18}
                                textAnchor="middle"
                                fill="var(--text-secondary)"
                                fontSize="11"
                                fontWeight="700">
                                {sName}
                            </text>
                        ))}
                    </svg>
                </div>

                {/* Strum / Audition Chord Button */}
                <button
                    type="button"
                    className="btn-primary"
                    onClick={handleStrum}
                    style={{
                        marginTop: 6,
                        width: '100%',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        padding: '9px 12px',
                        borderRadius: 8,
                        fontWeight: 700,
                    }}>
                    <Volume2 size={16} />
                    Strum {chordStr}
                </button>
            </div>
        </div>
    );
}
