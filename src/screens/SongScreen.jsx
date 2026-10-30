/**
 * @file src/screens/SongScreen.jsx
 * @version 2.4.0
 */
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Pause, Play } from 'lucide-react';
import executeQuery from '../shared/database';
import { AppContext } from '../shared/AppContext';
import { transposeChordToken } from '../shared/chordTransposer';

export const __version__ = '2.4.0';

export default function SongScreen({ routeParams, onNavigate, onBack }) {
    const { selectedSongId, originStr } = routeParams;
    const { transposition } = useContext(AppContext);

    const [songModalVisible, setSongModalVisible] = useState(false);
    const [songData, setSongData] = useState(null);
    const [bandName, setBandName] = useState('');
    const [featuringBands, setFeaturingBands] = useState([]);

    // Pinch-to-zoom and single-tap reset state
    const [fontSize, setFontSize] = useState(14);
    const pinchStartDistRef = useRef(null);
    const pinchStartSizeRef = useRef(14);

    // Auto-scroll state
    const scrollContainerRef = useRef(null);
    const [autoScrollActive, setAutoScrollActive] = useState(false);
    const [scrollSpeed, setScrollSpeed] = useState(2); // 1 (slow) to 5 (fast)

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

    // Smooth 60fps Auto-Scroll loop
    useEffect(() => {
        if (!autoScrollActive) {
            return;
        }
        let animationFrameId;
        let lastTime = performance.now();
        let subPixelAccumulator = 0;

        const pixelsPerSecond = scrollSpeed * 14; // 14px/s at 1x up to 70px/s at 5x

        const step = (now) => {
            const dt = (now - lastTime) / 1000;
            lastTime = now;

            const el = scrollContainerRef.current;
            if (el) {
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
        const re1 = /\((.+?)\)/g;
        let array1;
        let counter = 0;
        let outerLastIndex = 0;

        while ((array1 = re1.exec(lyrics)) !== null) {
            //console.log("here: "+array1);// prints:"(chords),chords"
            tmpSongScreenItems.push(
                <span key={counter}>
                    {lyrics.slice(outerLastIndex, re1.lastIndex - array1[0].length)}
                </span>
            );
            //console.log("---");
            //console.log("- "+array1[0]);
            let chordGroup = array1[1];
            let transposedStr = '(';
            let innerDone = false;

            while (innerDone === false) {
                //console.log("** chordGroup: ["+chordGroup+"]");
                const prefilter = /bpm/g.exec(chordGroup);
                if (prefilter !== null) {
                    transposedStr += chordGroup;
                    innerDone = true;
                    continue;
                }
                const delimiter = /  |_|!|riff|sus4|\.\.\.|\.\./g.exec(chordGroup);
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
                    transposedStr += transposeChordToken(treatable, transposition);
                    transposedStr += delimiter;
                    continue;
                }
                //Transposer.transpose(chord).up(0).toString();
                //console.log("** Pre-END!");
                if (chordGroup.length > 0) {
                    //console.log("** treatable: {"+chordGroup+"}");
                    transposedStr += transposeChordToken(chordGroup, transposition);
                }
                //console.log("** END!");
                innerDone = true;
            }
            transposedStr += ')';
            //console.log("+ "+transposedStr);
            tmpSongScreenItems.push(<strong key={counter + 1}>{transposedStr}</strong>);
            counter = counter + 2;
            outerLastIndex = re1.lastIndex;
        }

        tmpSongScreenItems.push(
            <span key={counter}>{lyrics.slice(outerLastIndex, lyrics.length)}</span>
        );

        return tmpSongScreenItems;
    }, [songData, transposition]);

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
                    <div className="autoscroll-pill">
                        <button
                            className="icon-btn"
                            style={{ padding: 4 }}
                            title={autoScrollActive ? 'Pause Auto-Scroll' : 'Start Auto-Scroll'}
                            onClick={() => setAutoScrollActive((v) => !v)}>
                            {autoScrollActive ? <Pause size={16} /> : <Play size={16} />}
                        </button>
                        <button
                            className="autoscroll-speed-btn"
                            title="Slower"
                            onClick={() => setScrollSpeed((s) => Math.max(1, s - 1))}>
                            -
                        </button>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{scrollSpeed}x</span>
                        <button
                            className="autoscroll-speed-btn"
                            title="Faster"
                            onClick={() => setScrollSpeed((s) => Math.min(5, s + 1))}>
                            +
                        </button>
                    </div>
                    <button className="btn-primary" onClick={() => setSongModalVisible(true)}>
                        Info
                    </button>
                </div>
            </header>

            <main
                ref={scrollContainerRef}
                className="content-scroll song-sheet-container"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onDoubleClick={() => setFontSize(14)}>
                <div className="song-lyrics-monospace" style={{ fontSize: `${fontSize}px` }}>
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
