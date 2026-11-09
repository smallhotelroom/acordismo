/**
 * @file src/screens/SongScreen.jsx
 * @version 3.0.0
 */
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import executeQuery from '../shared/database';
import { AppContext } from '../shared/AppContext';
import { FREEZE_CHORDS_STORAGE_KEY } from './SettingsScreen';
import { MetronomeIcon } from './HomeScreen';
import AutoScrollControl from '../components/AutoScrollControl';
import ChordDiagramPopover from '../components/ChordDiagramPopover';
import SongInfoModal from '../components/SongInfoModal';
import { buildSongSheetElements } from '../components/songSheetRenderer';
import {
    buildTransposedCustomVoicings,
    parseSongSections,
} from '../shared/songSections';
import {
    getMetronomeState,
    setMetronomePlaying,
    subscribeMetronomeState,
} from '../shared/audioEngine';
import { SYNTAX_PALETTE } from '@shr-shared/chordTransposer.js';
import { parseInstrumentTuning } from '../../../smallhotelroom.github.io/src/shared/songSchema.js';
import {
    deduceAcordismoSongKey,
    deduceAcordismoSongKeyInfo,
    deduceAcordismoSongUseFlats,
    stripCrawlerTabSections,
} from '../shared/crawlerTransposer';

export const __version__ = '3.0.0';

export default function SongScreen({ routeParams, onNavigate, onBack }) {
    const { selectedSongId, originStr } = routeParams;
    const {
        compensateCapo = false,
        fakeUkeEnabled = false,
        transposition,
        darkMode,
        topSpaceEnabled,
        freezeChordsEnabled: ctxFreezeChords,
        hideCrawlerTabsEnabled = true,
        chordDiagramsEnabled = true,
        chordInstrument = 'guitar',
        setChordInstrument,
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
    const [selectedDiagramChord, setSelectedDiagramChord] = useState(null);
    const [activeTranslationLang, setActiveTranslationLang] = useState(null);
    const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
    const [songData, setSongData] = useState(null);
    const [bandName, setBandName] = useState('');
    const [featuringBands, setFeaturingBands] = useState([]);
    const [sheetBgColor, setSheetBgColor] = useState('var(--bg-primary, #f3f4f6)');
    const [metroState, setMetroState] = useState(() => getMetronomeState());

    useEffect(() => {
        return subscribeMetronomeState((st) => setMetroState(st));
    }, []);

    // Pinch-to-zoom and double-tap reset state initialized to defaultFontSize from Settings
    const [fontSize, setFontSize] = useState(defaultFontSize);
    const pinchStartDistRef = useRef(null);
    const pinchStartSizeRef = useRef(defaultFontSize);
    const scrollContainerRef = useRef(null);

    useEffect(() => {
        setFontSize(defaultFontSize);
    }, [defaultFontSize]);

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
        setActiveTranslationLang(null);

        async function loadSong() {
            try {
                const songRes = await executeQuery('SELECT * FROM songs WHERE id = ?;', [
                    selectedSongId,
                ]);
                if (!songRes.rows.length) {
                    return;
                }
                const tmpSong = songRes.rows.item(0);

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

    // Total semitone shift applied to displayed chord names:
    // (1) Compensate Capo/Drop/Alternate + (2) Fake Uke (-5) + (3) Vocal Transposition
    const songCapo = Number(songData?.capo || 0);
    const visualOffset = useMemo(() => {
        const capoComp = compensateCapo || fakeUkeEnabled ? songCapo : 0;
        const ukeShift = fakeUkeEnabled ? -5 : 0;
        return capoComp + ukeShift + Number(transposition || 0);
    }, [compensateCapo, fakeUkeEnabled, songCapo, transposition]);

    const parsedTuning = useMemo(() => {
        if (!songData?.tuning) return null;
        const info = parseInstrumentTuning(songData.tuning, 'guitar');
        return info.valid && info.isCustom ? info : null;
    }, [songData]);

    const parsedSections = useMemo(() => {
        if (!songData) {
            return {
                primaryLang: 'Original',
                mainContent: '',
                translations: [],
                fingerings: [],
                customVoicings: { guitar: {}, ukulele: {} },
                otherSections: [],
            };
        }
        return parseSongSections(songData.contents || '', songData.lang || 'Original');
    }, [songData]);

    const activeTranslationObj = useMemo(() => {
        if (!activeTranslationLang) return null;
        return (
            parsedSections.translations.find((t) => t.lang === activeTranslationLang) ||
            null
        );
    }, [parsedSections, activeTranslationLang]);

    const mainSheetLyrics = useMemo(() => {
        if (!songData) return '';
        const baseText = parsedSections.mainContent;
        const isCrawlerOrigin = Number(songData.origin_id || 0) > 0;
        return isCrawlerOrigin && hideCrawlerTabsEnabled
            ? stripCrawlerTabSections(baseText)
            : baseText;
    }, [songData, parsedSections, hideCrawlerTabsEnabled]);

    const displayedLyrics = useMemo(() => {
        if (activeTranslationObj) {
            return activeTranslationObj.content;
        }
        return mainSheetLyrics;
    }, [activeTranslationObj, mainSheetLyrics]);

    const songUseFlats = useMemo(() => {
        if (!songData) return false;
        return deduceAcordismoSongUseFlats(
            mainSheetLyrics,
            visualOffset,
            songData.key,
            songData.origin_id
        );
    }, [songData, mainSheetLyrics, visualOffset]);

    const transposedCustomVoicings = useMemo(
        () =>
            buildTransposedCustomVoicings(
                parsedSections.customVoicings,
                visualOffset,
                songUseFlats
            ),
        [parsedSections.customVoicings, visualOffset, songUseFlats]
    );

    const deducedKeyDisplay = useMemo(() => {
        if (!songData) return null;
        const originId = songData.origin_id;
        if (songData.key) {
            if (!visualOffset) return songData.key;
            const shifted = deduceAcordismoSongKey(
                mainSheetLyrics,
                visualOffset,
                songData.key,
                originId
            );
            const sign = visualOffset > 0 ? `+${visualOffset}` : `${visualOffset}`;
            return shifted && shifted !== songData.key
                ? `${songData.key} (${shifted} at ${sign})`
                : songData.key;
        }
        const guessedOrig = deduceAcordismoSongKeyInfo(
            mainSheetLyrics,
            0,
            null,
            originId
        );
        if (!guessedOrig) return null;
        if (!visualOffset) {
            return `${guessedOrig.key} (guessed, ${guessedOrig.confidence}%)`;
        }
        const guessedShifted = deduceAcordismoSongKeyInfo(
            mainSheetLyrics,
            visualOffset,
            null,
            originId
        );
        const sign = visualOffset > 0 ? `+${visualOffset}` : `${visualOffset}`;
        return guessedShifted && guessedShifted.key !== guessedOrig.key
            ? `${guessedOrig.key} (guessed, ${guessedOrig.confidence}%; ${guessedShifted.key} at ${sign})`
            : `${guessedOrig.key} (guessed, ${guessedOrig.confidence}%)`;
    }, [songData, mainSheetLyrics, visualOffset]);

    const songScreenItems = useMemo(
        () =>
            buildSongSheetElements({
                songData,
                displayedLyrics,
                isTranslationView: Boolean(activeTranslationObj),
                songCapo,
                compensateCapo,
                fakeUkeEnabled,
                parsedTuning,
                visualOffset,
                songUseFlats,
                freezeChordsEnabled,
                onChordTap: chordDiagramsEnabled
                    ? (chordTokenStr) => setSelectedDiagramChord(chordTokenStr)
                    : null,
                sheetBgColor,
                palette,
            }),
        [
            songData,
            displayedLyrics,
            activeTranslationObj,
            songCapo,
            compensateCapo,
            fakeUkeEnabled,
            parsedTuning,
            visualOffset,
            songUseFlats,
            freezeChordsEnabled,
            chordDiagramsEnabled,
            sheetBgColor,
            palette,
        ]
    );

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
            setFontSize(
                Math.max(10, Math.min(36, Math.round(pinchStartSizeRef.current * scale)))
            );
        }
    };

    const handleTouchEnd = () => {
        pinchStartDistRef.current = null;
    };

    const songName = songData ? songData.name : '';
    const headerTitle = songName === '' ? '' : `${songName} [${originStr}]`;

    const rgb = darkMode ? '18, 18, 18' : '243, 244, 246';
    const bottomNavGradient = `linear-gradient(to top, rgba(${rgb}, 0.92) 0%, rgba(${rgb}, 0.78) 45%, rgba(${rgb}, 0.35) 78%, rgba(${rgb}, 0) 100%)`;

    const selectLanguageView = (langKey) => {
        setActiveTranslationLang(langKey);
        setSongModalVisible(false);
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = 0;
        }
    };

    return (
        <>
            <header className="app-header" style={{ position: 'relative', zIndex: 20000 }}>
                <div className="header-left">
                    <button className="icon-btn" onClick={onBack}>
                        <ArrowLeft size={22} />
                    </button>
                    <h1 className="header-title">{headerTitle}</h1>
                </div>
                <div className="header-actions">
                    {metroState.isPlaying && (
                        <button
                            type="button"
                            title="Stop Metronome"
                            onClick={() => setMetronomePlaying(false)}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '5px 8px',
                                borderRadius: 8,
                                border: '1px solid #f59e0b',
                                background: 'rgba(245, 158, 11, 0.16)',
                                color: '#f59e0b',
                                fontWeight: 800,
                                fontSize: '0.78rem',
                                cursor: 'pointer',
                            }}>
                            <MetronomeIcon size={15} />
                            {metroState.bpm}
                        </button>
                    )}

                    <AutoScrollControl
                        scrollContainerRef={scrollContainerRef}
                        speedMenuOpen={speedMenuOpen}
                        setSpeedMenuOpen={setSpeedMenuOpen}
                    />

                    <button className="btn-primary" onClick={() => setSongModalVisible(true)}>
                        Info
                    </button>
                </div>
            </header>

            <main
                ref={scrollContainerRef}
                className="content-scroll song-sheet-container"
                style={{ paddingTop: 0, position: 'relative', zIndex: 1 }}
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

            {selectedDiagramChord && (
                <ChordDiagramPopover
                    chordStr={selectedDiagramChord}
                    instrument={chordInstrument}
                    customVoicings={transposedCustomVoicings}
                    songCapo={songCapo}
                    songTuning={songData?.tuning || null}
                    vocalTransposition={transposition}
                    visualOffset={visualOffset}
                    compensateCapo={compensateCapo}
                    fakeUkeEnabled={fakeUkeEnabled}
                    onSelectInstrument={setChordInstrument}
                    onClose={() => setSelectedDiagramChord(null)}
                />
            )}

            <SongInfoModal
                visible={songModalVisible}
                songData={songData}
                bandName={bandName}
                featuringBands={featuringBands}
                parsedTuning={parsedTuning}
                deducedKeyDisplay={deducedKeyDisplay}
                parsedSections={parsedSections}
                activeTranslationLang={activeTranslationLang}
                onSelectLanguage={selectLanguageView}
                metroState={metroState}
                visualOffset={visualOffset}
                vocalTransposition={transposition}
                songUseFlats={songUseFlats}
                fontSize={fontSize}
                onNavigate={onNavigate}
                onClose={() => setSongModalVisible(false)}
            />
        </>
    );
}
