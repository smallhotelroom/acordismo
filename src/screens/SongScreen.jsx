/**
 * @file src/screens/SongScreen.jsx
 * @version 2.15.0
 */
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Pause, Play } from 'lucide-react';
import executeQuery from '../shared/database';
import { AppContext } from '../shared/AppContext';
import { FREEZE_CHORDS_STORAGE_KEY } from './SettingsScreen';
import {
    CHORD_GROUP_DELIMITER_REGEX,
    deduceSongUseFlats,
    transposeChordToken,
} from '@shr-shared/chordTransposer.js';

export const __version__ = '2.15.0';

const SCROLL_SPEED_STORAGE_KEY = 'acordismo_scroll_speed';
const TARGET_DURATION_SECONDS = 210; // 3 minutes 30 seconds at 1.0x

export default function SongScreen({ routeParams, onNavigate, onBack }) {
    const { selectedSongId, originStr } = routeParams;
    const {
        transposition,
        darkMode,
        freezeChordsEnabled: ctxFreezeChords,
    } = useContext(AppContext);

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

    // Pinch-to-zoom and single-tap reset state
    const [fontSize, setFontSize] = useState(14);
    const pinchStartDistRef = useRef(null);
    const pinchStartSizeRef = useRef(14);

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

    const songScreenItems = useMemo(() => {
        if (!songData) {
            return [];
        }

        const tmpSongScreenItems = [];

        if (songData.capo) {
            if (songData.capo < 1) {
                tmpSongScreenItems.push(
                    <strong key="drop">
                        (chords for drop {-songData.capo} semitones){'\n\n'}
                    </strong>
                );
            } else {
                tmpSongScreenItems.push(
                    <strong key="capo">
                        (chords for capo on {songData.capo}){'\n\n'}
                    </strong>
                );
            }
        }

        const lyrics = songData.contents || '';
        const useFlats = deduceSongUseFlats(lyrics, transposition, songData.key);
        const lines = lyrics.split('\n');
        let counter = 0;

        lines.forEach((lineText, lineIndex) => {
            const re1 = /\((.+?)\)/g;
            let array1;
            let outerLastIndex = 0;
            const lineNodes = [];
            let hasChordsOnLine = false;

            while ((array1 = re1.exec(lineText)) !== null) {
                //console.log("here: "+array1);// prints:"(chords),chords"
                lineNodes.push(
                    <span key={counter}>
                        {lineText.slice(outerLastIndex, re1.lastIndex - array1[0].length)}
                    </span>
                );
                //console.log("---");
                //console.log("- "+array1[0]);
                let chordGroup = array1[1];
                let transposedStr = '(';
                let innerDone = false;
                let isDirectiveGroup = false;

                while (innerDone === false) {
                    //console.log("** chordGroup: ["+chordGroup+"]");
                    const prefilter =
                        /bpm|tempo|key|highest|falsetto|all|chords for|capo|drop/i.exec(
                            chordGroup
                        );
                    if (prefilter !== null) {
                        isDirectiveGroup = true;
                        transposedStr += chordGroup;
                        innerDone = true;
                        continue;
                    }
                    const delimiter = CHORD_GROUP_DELIMITER_REGEX.exec(chordGroup);
                    if (delimiter !== null) {
                        //console.log("** At "+delimiter.index+" found delimiter ["+delimiter+"] of size: "+delimiter[0].length);
                        const treatable = chordGroup.slice(0, delimiter.index);
                        chordGroup = chordGroup.slice(
                            delimiter.index + delimiter[0].length,
                            chordGroup.length
                        );
                        if (delimiter.index === 0) {
                            transposedStr += delimiter;
                            continue;
                        }
                        //console.log("** treatable: {"+treatable+"}");
                        transposedStr += transposeChordToken(treatable, transposition, useFlats);
                        transposedStr += delimiter;
                        continue;
                    }
                    //Transposer.transpose(chord).up(0).toString();
                    //console.log("** Pre-END!");
                    if (chordGroup.length > 0) {
                        //console.log("** treatable: {"+chordGroup+"}");
                        transposedStr += transposeChordToken(chordGroup, transposition, useFlats);
                    }
                    //console.log("** END!");
                    innerDone = true;
                }
                transposedStr += ')';
                if (!isDirectiveGroup) {
                    hasChordsOnLine = true;
                }
                //console.log("+ "+transposedStr);
                lineNodes.push(<strong key={counter + 1}>{transposedStr}</strong>);
                counter = counter + 2;
                outerLastIndex = re1.lastIndex;
            }

            lineNodes.push(
                <span key={counter}>{lineText.slice(outerLastIndex, lineText.length)}</span>
            );
            counter += 1;

            const isLastLine = lineIndex === lines.length - 1;
            if (hasChordsOnLine) {
                tmpSongScreenItems.push(
                    <div
                        key={`line-${lineIndex}`}
                        style={
                            freezeChordsEnabled
                                ? {
                                      position: 'sticky',
                                      top: 0,
                                      zIndex: 10 + lineIndex,
                                      backgroundColor: sheetBgColor,
                                      // Negative vertical margins cancel out the padding in normal flow,
                                      // while preserving a 15px top margin and 4px bottom cushion when frozen at top: 0!
                                      margin: '-15px -15px -4px -15px',
                                      padding: '15px 15px 4px 15px',
                                  }
                                : undefined
                        }>
                        {lineNodes}
                    </div>
                );
            } else {
                tmpSongScreenItems.push(
                    <span key={`line-${lineIndex}`}>
                        {lineNodes}
                        {!isLastLine ? '\n' : ''}
                    </span>
                );
            }
        });

        return tmpSongScreenItems;
    }, [songData, transposition, freezeChordsEnabled, sheetBgColor]);

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

    return (
        <>
            <header className="app-header">
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
                onDoubleClick={() => setFontSize(14)}>
                <div
                    className="song-lyrics-monospace"
                    style={{ fontSize: `${fontSize}px`, paddingTop: 15 }}>
                    {songScreenItems}
                </div>
            </main>

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
