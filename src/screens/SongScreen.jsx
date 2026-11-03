/**
 * @file src/screens/SongScreen.jsx
 * @version 2.27.0
 */
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Pause, Play } from 'lucide-react';
import executeQuery from '../shared/database';
import { AppContext } from '../shared/AppContext';
import { FREEZE_CHORDS_STORAGE_KEY } from './SettingsScreen';
import {
    CHORD_GROUP_DELIMITER_REGEX,
    DIRECTIVE_PAREN_REGEX,
    SYNTAX_PALETTE,
    deduceSongUseFlats,
    isStandaloneChordLine,
    transposeChordToken,
} from '@shr-shared/chordTransposer.js';

export const __version__ = '2.27.0';

const SCROLL_SPEED_STORAGE_KEY = 'acordismo_scroll_speed';
const TARGET_DURATION_SECONDS = 210; // 3 minutes 30 seconds at 1.0x

/**
 * Preserves the absolute original initNote and, when transposition !== 0,
 * appends a concise comment showing the resulting transposed note/pitch relationship.
 */
function formatInitNoteDisplay(rawInitNote, transposition, songCapo, useFlats) {
    if (!rawInitNote) return null;
    const baseStr = String(rawInitNote).trim();
    if (!transposition) {
        return baseStr;
    }

    const sign = transposition > 0 ? `+${transposition}` : `${transposition}`;
    const shiftedStr = baseStr.replace(/\b([A-G][#b]?[0-9]?)\b/g, (tok) =>
        transposeChordToken(tok, transposition, useFlats)
    );

    const numCapo = Number(songCapo || 0);
    if (numCapo !== 0 && transposition === numCapo) {
        return `${baseStr} (${shiftedStr} at ${sign}; matches original concert pitch without capo/drop)`;
    }
    if (transposition + 5 === numCapo) {
        return `${baseStr} (${shiftedStr} at ${sign}; matches original concert pitch on Ukulele)`;
    }
    if (shiftedStr !== baseStr) {
        return `${baseStr} (${shiftedStr} if shifted ${sign})`;
    }
    return `${baseStr} (transposition ${sign})`;
}

/**
 * Renders plain lyric segments while highlighting any [choir / backing vocal] blocks
 * using the shared SYNTAX_PALETTE choir color.
 */
function renderLyricWithChoir(text, choirColor, baseKey) {
    if (!text || !text.includes('[')) {
        return <span key={baseKey}>{text}</span>;
    }
    const parts = [];
    const regex = /\[[^\]]+\]/g;
    let lastIdx = 0;
    let match;
    let subIdx = 0;
    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIdx) {
            parts.push(
                <span key={`${baseKey}-t-${subIdx++}`}>{text.slice(lastIdx, match.index)}</span>
            );
        }
        parts.push(
            <em
                key={`${baseKey}-c-${subIdx++}`}
                style={{ color: choirColor, fontStyle: 'italic' }}>
                {match[0]}
            </em>
        );
        lastIdx = match.index + match[0].length;
    }
    if (lastIdx < text.length) {
        parts.push(<span key={`${baseKey}-t-${subIdx++}`}>{text.slice(lastIdx)}</span>);
    }
    return <span key={baseKey}>{parts}</span>;
}

export default function SongScreen({ routeParams, onNavigate, onBack }) {
    const { selectedSongId, originStr } = routeParams;
    const {
        transposition,
        darkMode,
        topSpaceEnabled,
        freezeChordsEnabled: ctxFreezeChords,
        defaultFontSize = 14,
    } = useContext(AppContext);

    const palette = darkMode ? SYNTAX_PALETTE.dark : SYNTAX_PALETTE.light;

    const freezeChordsEnabled = useMemo(() => {
        if (ctxFreezeChords !== undefined) {
            return ctxFreezeChords;
        }
        const saved = localStorage.getItem(FREEZE_CHORDS_STORAGE_KEY);
        return saved !== null ? saved === 'true' : true;
    }, [ctxFreezeChords]);

    const [songModalVisible, setSongModalVisible] = useState(false);
    const [songData, setSongData] = useState(null);
    const [bandName, setBandName] = useState('');
    const [featuringBands, setFeaturingBands] = useState([]);
    const [sheetBgColor, setSheetBgColor] = useState('var(--bg-primary, #f3f4f6)');

    // Pinch-to-zoom and double-tap reset state initialized to defaultFontSize from Settings
    const [fontSize, setFontSize] = useState(defaultFontSize);
    const pinchStartDistRef = useRef(null);
    const pinchStartSizeRef = useRef(defaultFontSize);

    useEffect(() => {
        setFontSize(defaultFontSize);
    }, [defaultFontSize]);

    // Auto-scroll state (calibrated: 1.0x = full song in 3:30, range 0.0x to 3.0x in 0.1 steps, default 1.0x)
    const scrollContainerRef = useRef(null);
    const [autoScrollActive, setAutoScrollActive] = useState(false);
    const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
    const [scrollSpeed, setScrollSpeed] = useState(() => {
        const saved = parseFloat(localStorage.getItem(SCROLL_SPEED_STORAGE_KEY));
        return !Number.isNaN(saved) && saved >= 0.0 && saved <= 3.0 ? saved : 1.0;
    });

    const updateScrollSpeed = (nextVal) => {
        const clamped = Math.max(0.0, Math.min(3.0, Math.round(nextVal * 10) / 10));
        setScrollSpeed(clamped);
        localStorage.setItem(SCROLL_SPEED_STORAGE_KEY, String(clamped));
    };

    const handleTogglePlay = () => {
        setAutoScrollActive((prev) => !prev);
    };

    // Sample the exact computed background color of the song sheet container so sticky lines are 100% opaque
    useEffect(() => {
        if (scrollContainerRef.current) {
            const bg = window.getComputedStyle(scrollContainerRef.current).backgroundColor;
            if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
                setSheetBgColor(bg);
                return;
            }
        }
        setSheetBgColor(darkMode ? '#121212' : '#f3f4f6');
    }, [darkMode, songData]);

    useEffect(() => {
        let isMounted = true;

        async function loadSong() {
            try {
                const songRes = await executeQuery('SELECT * FROM songs WHERE id = ?;', [
                    selectedSongId,
                ]);
                if (!songRes.rows.length) {
                    return;
                }
                const tmpSong = songRes.rows.item(0); // index 0 means we count on unique id

                const [bandRes, ftRes] = await Promise.all([
                    executeQuery('SELECT name FROM bands WHERE id = ?;', [tmpSong.band_id]),
                    executeQuery(
                        'SELECT id, name FROM bands WHERE id IN (SELECT ft_band_id FROM songs_ft_bands WHERE song_id = ?);',
                        [selectedSongId]
                    ),
                ]);

                if (!isMounted) {
                    return;
                }

                setSongData(tmpSong);
                if (bandRes.rows.length > 0) {
                    setBandName(bandRes.rows.item(0).name);
                }

                setFeaturingBands(ftRes.rows._array);
                if (scrollContainerRef.current) {
                    scrollContainerRef.current.scrollTop = 0;
                }
            } catch (err) {
                console.error(err);
            }
        }

        loadSong();
        return () => {
            isMounted = false;
        };
    }, [selectedSongId]);

    // Smooth 60fps Auto-Scroll loop dynamically scaled so 1.0x = 3:30 (210s) at current zoom level
    useEffect(() => {
        if (!autoScrollActive) {
            return;
        }
        let animationFrameId;
        let lastTime = performance.now();
        let subPixelAccumulator = 0;

        const step = (now) => {
            const dt = (now - lastTime) / 1000;
            lastTime = now;

            const el = scrollContainerRef.current;
            if (el) {
                const totalScrollableDistance = Math.max(0, el.scrollHeight - el.clientHeight);
                if (totalScrollableDistance > 0 && scrollSpeed > 0) {
                    // Base velocity so 1.0x covers totalScrollableDistance in 210 seconds (3:30)
                    const basePixelsPerSecond = totalScrollableDistance / TARGET_DURATION_SECONDS;
                    const pixelsPerSecond = basePixelsPerSecond * scrollSpeed;

                    subPixelAccumulator += pixelsPerSecond * dt;
                    if (subPixelAccumulator >= 1) {
                        const wholePixels = Math.floor(subPixelAccumulator);
                        el.scrollTop += wholePixels;
                        subPixelAccumulator -= wholePixels;

                        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
                            setAutoScrollActive(false);
                            return;
                        }
                    }
                }
            }
            animationFrameId = requestAnimationFrame(step);
        };

        animationFrameId = requestAnimationFrame(step);
        return () => cancelAnimationFrame(animationFrameId);
    }, [autoScrollActive, scrollSpeed]);

    const songUseFlats = useMemo(() => {
        if (!songData) return false;
        return deduceSongUseFlats(songData.contents || '', transposition, songData.key);
    }, [songData, transposition]);

    const songScreenItems = useMemo(() => {
        if (!songData) {
            return [];
        }

        const preChordItems = [];
        const sections = [];
        let currentSection = null;

        if (songData.capo) {
            if (songData.capo < 1) {
                preChordItems.push(
                    <strong key="drop" style={{ color: palette.directive }}>
                        (chords for drop {-songData.capo} semitones){'\n\n'}
                    </strong>
                );
            } else {
                preChordItems.push(
                    <strong key="capo" style={{ color: palette.directive }}>
                        (chords for capo on {songData.capo}){'\n\n'}
                    </strong>
                );
            }
        }

        const lyrics = songData.contents || '';
        const useFlats = songUseFlats;
        const lines = lyrics.split('\n');
        let counter = 0;

        lines.forEach((lineText, lineIndex) => {
            const lineNodes = [];
            let hasChordsOnLine = false;

            // Case A: Standalone chord line (e.g. OrigenZK / OrigenLK where line is 100% chords & spaces)
            if (isStandaloneChordLine(lineText)) {
                hasChordsOnLine = true;
                const tokenRegex = /(\S+)/g;
                let tokMatch;
                let lastIdx = 0;

                while ((tokMatch = tokenRegex.exec(lineText)) !== null) {
                    if (tokMatch.index > lastIdx) {
                        lineNodes.push(
                            <span key={counter++}>
                                {lineText.slice(lastIdx, tokMatch.index)}
                            </span>
                        );
                    }
                    const chordStr = tokMatch[0];
                    lineNodes.push(
                        <strong key={counter++} style={{ color: palette.chord }}>
                            {transposeChordToken(chordStr, transposition, useFlats)}
                        </strong>
                    );
                    lastIdx = tokenRegex.lastIndex;
                }
                if (lastIdx < lineText.length) {
                    lineNodes.push(<span key={counter++}>{lineText.slice(lastIdx)}</span>);
                }
            } else {
                // Case B: Standard parenthetical (...) chord notation + [choir] blocks
                const re1 = /\((.+?)\)/g;
                let array1;
                let outerLastIndex = 0;

                while ((array1 = re1.exec(lineText)) !== null) {
                    //console.log("here: "+array1);// prints:"(chords),chords"
                    lineNodes.push(
                        renderLyricWithChoir(
                            lineText.slice(outerLastIndex, re1.lastIndex - array1[0].length),
                            palette.choir,
                            counter
                        )
                    );
                    //console.log("---");
                    //console.log("- "+array1[0]);
                    let chordGroup = array1[1];
                    let innerDone = false;
                    let isDirectiveGroup = false;
                    const innerTokens = [];
                    let tokIdx = 0;

                    while (innerDone === false) {
                        //console.log("** chordGroup: ["+chordGroup+"]");
                        const prefilter = DIRECTIVE_PAREN_REGEX.exec(chordGroup);
                        if (prefilter !== null) {
                            isDirectiveGroup = true;
                            innerTokens.push(
                                <span
                                    key={`dir-${tokIdx++}`}
                                    style={{ color: palette.directive }}>
                                    {chordGroup}
                                </span>
                            );
                            innerDone = true;
                            continue;
                        }
                        const delimiter = CHORD_GROUP_DELIMITER_REGEX.exec(chordGroup);
                        if (delimiter !== null) {
                            //console.log("** At "+delimiter.index+" found delimiter ["+delimiter+"] of size: "+delimiter[0].length);
                            const treatable = chordGroup.slice(0, delimiter.index);
                            const delimStr = delimiter[0];
                            chordGroup = chordGroup.slice(
                                delimiter.index + delimStr.length,
                                chordGroup.length
                            );
                            if (delimiter.index === 0) {
                                innerTokens.push(
                                    <span
                                        key={`mod-${tokIdx++}`}
                                        style={{ color: palette.modifier }}>
                                        {delimStr}
                                    </span>
                                );
                                continue;
                            }
                            //console.log("** treatable: {"+treatable+"}");
                            innerTokens.push(
                                <span key={`ch-${tokIdx++}`} style={{ color: palette.chord }}>
                                    {transposeChordToken(treatable, transposition, useFlats)}
                                </span>
                            );
                            innerTokens.push(
                                <span
                                    key={`mod-${tokIdx++}`}
                                    style={{ color: palette.modifier }}>
                                    {delimStr}
                                </span>
                            );
                            continue;
                        }
                        //Transposer.transpose(chord).up(0).toString();
                        //console.log("** Pre-END!");
                        if (chordGroup.length > 0) {
                            //console.log("** treatable: {"+chordGroup+"}");
                            innerTokens.push(
                                <span key={`ch-${tokIdx++}`} style={{ color: palette.chord }}>
                                    {transposeChordToken(chordGroup, transposition, useFlats)}
                                </span>
                            );
                        }
                        //console.log("** END!");
                        innerDone = true;
                    }

                    if (!isDirectiveGroup) {
                        hasChordsOnLine = true;
                        lineNodes.push(
                            <strong key={counter + 1}>
                                <span style={{ color: palette.parenSymbol }}>(</span>
                                {innerTokens}
                                <span style={{ color: palette.parenSymbol }}>)</span>
                            </strong>
                        );
                    } else {
                        lineNodes.push(
                            <strong key={counter + 1} style={{ color: palette.directive }}>
                                ({innerTokens})
                            </strong>
                        );
                    }

                    counter = counter + 2;
                    outerLastIndex = re1.lastIndex;
                }

                lineNodes.push(
                    renderLyricWithChoir(
                        lineText.slice(outerLastIndex, lineText.length),
                        palette.choir,
                        counter
                    )
                );
                counter += 1;
            }

            const isLastLine = lineIndex === lines.length - 1;
            if (hasChordsOnLine) {
                const chordLineEl = (
                    <div
                        key={`line-${lineIndex}`}
                        style={
                            freezeChordsEnabled
                                ? {
                                      position: 'sticky',
                                      top: 15,
                                      zIndex: 10 + lineIndex,
                                      backgroundColor: sheetBgColor,
                                      margin: '0 -15px',
                                      padding: '0 15px',
                                  }
                                : undefined
                        }>
                        {lineNodes}
                    </div>
                );
                currentSection = {
                    key: `sec-${lineIndex}`,
                    items: [chordLineEl],
                };
                sections.push(currentSection);
            } else {
                const lyricLineEl = (
                    <span key={`line-${lineIndex}`}>
                        {lineNodes}
                        {!isLastLine ? '\n' : ''}
                    </span>
                );
                if (currentSection) {
                    currentSection.items.push(lyricLineEl);
                } else {
                    preChordItems.push(lyricLineEl);
                }
            }
        });

        return [
            ...preChordItems,
            ...sections.map((sec) => <div key={sec.key}>{sec.items}</div>),
        ];
    }, [songData, transposition, songUseFlats, freezeChordsEnabled, sheetBgColor, palette]);

    // Touch pinch-to-zoom handlers
    const handleTouchStart = (e) => {
        if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            pinchStartDistRef.current = Math.hypot(dx, dy);
            pinchStartSizeRef.current = fontSize;
        }
    };

    const handleTouchMove = (e) => {
        if (e.touches.length === 2 && pinchStartDistRef.current) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.hypot(dx, dy);
            const scale = dist / pinchStartDistRef.current;
            setFontSize(Math.max(10, Math.min(36, Math.round(pinchStartSizeRef.current * scale))));
        }
    };

    const handleTouchEnd = () => {
        pinchStartDistRef.current = null;
    };

    const songName = songData ? songData.name : '';
    const headerTitle = songName === '' ? '' : `${songName} [${originStr}]`;

    // 76px bottom gradient scoped directly to SongScreen (only visible in portrait mode)
    const rgb = darkMode ? '18, 18, 18' : '243, 244, 246';
    const bottomNavGradient = `linear-gradient(to top, rgba(${rgb}, 0.92) 0%, rgba(${rgb}, 0.78) 45%, rgba(${rgb}, 0.35) 78%, rgba(${rgb}, 0) 100%)`;

    return (
        <>
            {/* Elevated zIndex (20000) ensures the header and its vertical speed popover always render above sticky chords */}
            <header className="app-header" style={{ position: 'relative', zIndex: 20000 }}>
                <div className="header-left">
                    <button className="icon-btn" onClick={onBack}>
                        <ArrowLeft size={22} />
                    </button>
                    <h1 className="header-title">{headerTitle}</h1>
                </div>
                <div className="header-actions">
                    <div className="autoscroll-anchor">
                        <div className={`autoscroll-pill ${autoScrollActive ? 'active' : ''}`}>
                            <button
                                className="autoscroll-play-btn"
                                title={autoScrollActive ? 'Pause Auto-Scroll' : 'Start Auto-Scroll'}
                                onClick={handleTogglePlay}>
                                {autoScrollActive ? <Pause size={15} /> : <Play size={15} />}
                            </button>
                            <button
                                className="autoscroll-speed-trigger"
                                title="Adjust Scroll Speed"
                                onClick={() => setSpeedMenuOpen((o) => !o)}>
                                {scrollSpeed.toFixed(1)}x
                            </button>
                        </div>

                        {speedMenuOpen && (
                            <div
                                className="autoscroll-vertical-popover"
                                style={{ zIndex: 20001 }}
                                onClick={(e) => e.stopPropagation()}>
                                <button
                                    className="autoscroll-step-btn"
                                    title="Faster (+0.1x)"
                                    onClick={() => updateScrollSpeed(scrollSpeed + 0.1)}>
                                    +
                                </button>
                                <div
                                    className="autoscroll-vertical-slider-wrap"
                                    onDoubleClick={() => updateScrollSpeed(1.0)}
                                    title="Double-click to reset to 1.0x">
                                    <input
                                        type="range"
                                        className="autoscroll-vertical-slider"
                                        min="0.0"
                                        max="3.0"
                                        step="0.1"
                                        value={scrollSpeed}
                                        onChange={(e) =>
                                            updateScrollSpeed(parseFloat(e.target.value))
                                        }
                                        onDoubleClick={() => updateScrollSpeed(1.0)}
                                    />
                                </div>
                                <span
                                    style={{
                                        fontWeight: 700,
                                        fontSize: '0.82rem',
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                    }}
                                    title="Double-click to reset to 1.0x"
                                    onDoubleClick={() => updateScrollSpeed(1.0)}>
                                    {scrollSpeed.toFixed(1)}x
                                </span>
                                <button
                                    className="autoscroll-step-btn"
                                    title="Slower (-0.1x)"
                                    onClick={() => updateScrollSpeed(scrollSpeed - 0.1)}>
                                    -
                                </button>
                            </div>
                        )}
                    </div>

                    <button className="btn-primary" onClick={() => setSongModalVisible(true)}>
                        Info
                    </button>
                </div>
            </header>

            <main
                ref={scrollContainerRef}
                className="content-scroll song-sheet-container"
                style={{ paddingTop: 0 }}
                onClick={() => {
                    if (speedMenuOpen) {
                        setSpeedMenuOpen(false);
                    }
                }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onDoubleClick={() => setFontSize(defaultFontSize)}>
                <div
                    className={`song-lyrics-monospace ${topSpaceEnabled ? 'song-lyrics-portrait-pad' : ''}`}
                    style={{
                        fontSize: `${fontSize}px`,
                        paddingTop: 15,
                        paddingBottom: 15,
                    }}>
                    {/* Single 15px ceiling mask so scrolling lyrics and outgoing sticky headers never peek above `top: 15px` */}
                    {freezeChordsEnabled && (
                        <div
                            style={{
                                position: 'sticky',
                                top: 0,
                                height: 15,
                                marginTop: -15,
                                marginLeft: -15,
                                marginRight: -15,
                                backgroundColor: sheetBgColor,
                                zIndex: 10000,
                                pointerEvents: 'none',
                            }}
                        />
                    )}
                    {songScreenItems}
                </div>
            </main>

            {/* SongScreen Bottom Gradient Fade over OS navigation area (Portrait mode only) */}
            {topSpaceEnabled && (
                <div
                    className="portrait-only-bottom-bar"
                    style={{
                        position: 'fixed',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: '76px',
                        background: bottomNavGradient,
                        pointerEvents: 'none',
                        zIndex: 90,
                    }}
                />
            )}

            {songModalVisible && songData && (
                <div className="modal-backdrop" onClick={() => setSongModalVisible(false)}>
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
                            {songData.bpm && <div>Bpm: {songData.bpm}</div>}
                            {songData.capo ? (
                                songData.capo < 1 ? (
                                    <div>Drop: {-songData.capo}</div>
                                ) : (
                                    <div>Capo: {songData.capo}</div>
                                )
                            ) : null}
                            {songData.key && <div>Key: {songData.key}</div>}
                            {songData.init_note && (
                                <div>
                                    Init note:{' '}
                                    {formatInitNoteDisplay(
                                        songData.init_note,
                                        transposition,
                                        songData.capo,
                                        songUseFlats
                                    )}
                                </div>
                            )}
                            {songData.time_signature && (
                                <div>Time signature: {songData.time_signature}</div>
                            )}
                            {songData.falsetto && <div>Falsetto: {songData.falsetto}</div>}
                            {songData.highest && <div>Highest: {songData.highest}</div>}
                            {songData.lang && <div>Lang: {songData.lang}</div>}
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
                                                style={{ cursor: 'pointer', textDecoration: 'underline' }}
                                                onClick={() => {
                                                    setSongModalVisible(false);
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
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 6 }}>
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
                            <span>Transposition: {transposition}</span>
                            <span>Font size: {fontSize}px</span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 15 }}>
                            <button
                                className="btn-primary"
                                onClick={() => setSongModalVisible(false)}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
