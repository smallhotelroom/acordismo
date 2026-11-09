/**
 * @file src/components/SongInfoModal.jsx
 * @version 1.0.0
 * Modal displaying song metadata, BPM metronome trigger, deduced key, custom tuning,
 * interactive language translation switcher (e.g. "Lang: English / Español"), and featuring band links.
 */
import React from 'react';
import { transposeChordToken } from '@shr-shared/chordTransposer.js';
import { MetronomeIcon } from '../screens/HomeScreen';
import { setMetronomeBpm, setMetronomePlaying } from '../shared/audioEngine';

export const __version__ = '1.0.0';

/**
 * Formats initNote: only Setting 3 (`vocalTransposition`) affects the singing pitch & initNote!
 */
export function formatInitNoteDisplay(rawInitNote, vocalTransposition, useFlats) {
    if (!rawInitNote) return null;
    const baseStr = String(rawInitNote).trim();
    if (!vocalTransposition) {
        return baseStr;
    }

    const sign = vocalTransposition > 0 ? `+${vocalTransposition}` : `${vocalTransposition}`;
    const shiftedStr = baseStr.replace(/\b([A-G][#b]?[0-9]?)\b/g, (tok) =>
        transposeChordToken(tok, vocalTransposition, useFlats)
    );

    if (shiftedStr !== baseStr) {
        return `${baseStr} (${shiftedStr} at ${sign})`;
    }
    return `${baseStr} (vocal ${sign})`;
}

export default function SongInfoModal({
    visible,
    songData,
    bandName,
    featuringBands = [],
    parsedTuning = null,
    deducedKeyDisplay = null,
    parsedSections,
    activeTranslationLang = null,
    onSelectLanguage,
    metroState,
    visualOffset = 0,
    vocalTransposition = 0,
    songUseFlats = false,
    fontSize = 14,
    onNavigate,
    onClose,
}) {
    if (!visible || !songData) {
        return null;
    }

    const translations = parsedSections?.translations || [];
    const primaryLang = parsedSections?.primaryLang || 'Original';

    return (
        <div
            className="modal-backdrop"
            style={{ zIndex: 30000 }}
            onClick={onClose}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div
                    style={{
                        borderBottom: '1px solid var(--border-color)',
                        paddingBottom: 15,
                        lineHeight: 1.6,
                    }}>
                    <div>Song: {songData.name}</div>
                    {bandName && <div>Band: {bandName}</div>}
                    {songData.album && <div>Album: {songData.album}</div>}
                    {songData.track && <div>Track: {songData.track}</div>}
                    {songData.author && <div>Author: {songData.author}</div>}
                    {songData.writer && songData.writer !== songData.author && (
                        <div>Writer: {songData.writer}</div>
                    )}
                    {songData.bpm && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span>Bpm: {songData.bpm}</span>
                            <button
                                type="button"
                                onClick={() => {
                                    setMetronomeBpm(Number(songData.bpm));
                                    if (
                                        metroState.isPlaying &&
                                        metroState.bpm === Number(songData.bpm)
                                    ) {
                                        setMetronomePlaying(false);
                                    } else {
                                        setMetronomePlaying(true);
                                    }
                                }}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    padding: '2px 8px',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    borderRadius: 6,
                                    border: '1px solid var(--border-color)',
                                    background:
                                        metroState.isPlaying &&
                                        metroState.bpm === Number(songData.bpm)
                                            ? '#dc2626'
                                            : '#2563eb',
                                    color: '#ffffff',
                                    cursor: 'pointer',
                                }}>
                                <MetronomeIcon size={12} />
                                {metroState.isPlaying &&
                                metroState.bpm === Number(songData.bpm)
                                    ? 'Stop'
                                    : 'Metronome'}
                            </button>
                        </div>
                    )}
                    {songData.capo ? (
                        songData.capo < 1 ? (
                            <div>Drop: {-songData.capo}</div>
                        ) : (
                            <div>Capo: {songData.capo}</div>
                        )
                    ) : null}
                    {parsedTuning && <div>Tuning: {parsedTuning.displayStr}</div>}
                    {deducedKeyDisplay && <div>Key: {deducedKeyDisplay}</div>}
                    {songData.init_note && (
                        <div>
                            Init note:{' '}
                            {formatInitNoteDisplay(
                                songData.init_note,
                                vocalTransposition,
                                songUseFlats
                            )}
                        </div>
                    )}
                    {songData.time_signature && (
                        <div>Time signature: {songData.time_signature}</div>
                    )}
                    {songData.falsetto && <div>Falsetto: {songData.falsetto}</div>}
                    {songData.highest && <div>Highest: {songData.highest}</div>}
                    {(songData.lang || translations.length > 0) && (
                        <div>
                            Lang:{' '}
                            {translations.length === 0 ? (
                                songData.lang
                            ) : (
                                <>
                                    <span
                                        onClick={() => onSelectLanguage(null)}
                                        style={{
                                            cursor: 'pointer',
                                            fontWeight:
                                                activeTranslationLang === null ? 700 : 400,
                                            color:
                                                activeTranslationLang === null
                                                    ? 'var(--accent-color)'
                                                    : 'var(--text-secondary)',
                                            textDecoration:
                                                activeTranslationLang === null
                                                    ? 'underline'
                                                    : 'none',
                                        }}>
                                        {primaryLang}
                                    </span>
                                    {translations.map((tr) => {
                                        const isSelected =
                                            activeTranslationLang === tr.lang;
                                        return (
                                            <React.Fragment key={tr.lang}>
                                                <span
                                                    style={{
                                                        color: 'var(--text-secondary)',
                                                    }}>
                                                    {' / '}
                                                </span>
                                                <span
                                                    onClick={() =>
                                                        onSelectLanguage(tr.lang)
                                                    }
                                                    style={{
                                                        cursor: 'pointer',
                                                        fontWeight: isSelected ? 700 : 400,
                                                        color: isSelected
                                                            ? 'var(--accent-color)'
                                                            : 'var(--text-secondary)',
                                                        textDecoration: isSelected
                                                            ? 'underline'
                                                            : 'none',
                                                    }}>
                                                    {tr.lang}
                                                </span>
                                            </React.Fragment>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    )}
                    {songData.license && <div>License: {songData.license}</div>}
                    {songData.isrc && <div>ISRC: {songData.isrc}</div>}
                    {songData.url && (
                        <div>
                            URL:{' '}
                            <a href={songData.url} target="_blank" rel="noreferrer">
                                {songData.url}
                            </a>
                        </div>
                    )}
                    {songData.spotify && (
                        <div>
                            Spotify:{' '}
                            <a
                                href={
                                    songData.spotify.startsWith('http')
                                        ? songData.spotify
                                        : `https://open.spotify.com/track/${songData.spotify}`
                                }
                                target="_blank"
                                rel="noreferrer">
                                {songData.spotify}
                            </a>
                        </div>
                    )}
                    {featuringBands.length > 0 && (
                        <div>
                            Featuring:{' '}
                            {featuringBands.map((ft, idx) => (
                                <span key={ft.id}>
                                    <span
                                        style={{
                                            cursor: 'pointer',
                                            textDecoration: 'underline',
                                        }}
                                        onClick={() => {
                                            onClose();
                                            onNavigate({
                                                screen: 'Band',
                                                params: { selectedBandId: ft.id },
                                            });
                                        }}>
                                        {ft.name}
                                    </span>
                                    {idx < featuringBands.length - 1 ? '; ' : ''}
                                </span>
                            ))}
                        </div>
                    )}
                    {songData.content_hash && (
                        <div
                            style={{
                                fontSize: '0.78rem',
                                color: 'var(--text-secondary)',
                                marginTop: 6,
                            }}>
                            Hash: <code>{songData.content_hash}</code>
                        </div>
                    )}
                </div>

                <div
                    style={{
                        borderBottom: '1px solid var(--border-color)',
                        padding: '15px 0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}>
                    <span>
                        Chord shift:{' '}
                        {visualOffset > 0 ? `+${visualOffset}` : visualOffset}
                        {vocalTransposition !== 0
                            ? ` (vocal ${vocalTransposition > 0 ? `+${vocalTransposition}` : vocalTransposition})`
                            : ''}
                    </span>
                    <span>Font size: {fontSize}px</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 15 }}>
                    <button className="btn-primary" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
