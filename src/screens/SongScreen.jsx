/**
 * @file src/screens/SongScreen.jsx
 * @version 3.4.0
 */
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Music, Sliders, Square } from 'lucide-react';
import executeQuery from '../shared/database';
import { AppContext } from '../shared/AppContext';
import { FREEZE_CHORDS_STORAGE_KEY } from './SettingsScreen';
import { MetronomeIcon } from './HomeScreen';
import AutoScrollControl from '../components/AutoScrollControl';
import ChordDiagramPopover from '../components/ChordDiagramPopover';
import SongInfoModal from '../components/SongInfoModal';
import SongStrumModal from '../components/SongStrumModal';
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
import {
    getSyntaxPalette,
    parseInstrumentTuning,
} from '../shared/songSchema.js';
import {
    deduceAcordismoSongKey,
    deduceAcordismoSongKeyInfo,
    deduceAcordismoSongUseFlats,
    stripCrawlerTabSections,
} from '../shared/crawlerTransposer';
import {
    buildSongChordSequence,
    buildStrumPresetTracks,
    parseBeatsPerBar,
    resizeStrumTracks,
    triggerPatternStepOnChord,
} from '../shared/songChordPlayer';

export const __version__ = '3.4.0';

export default function SongScreen({ routeParams, onNavigate, onBack }) {
    const { selectedSongId, originStr } = routeParams;
    const {
        colorTheme = 'shr',
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

    const themePalettes = getSyntaxPalette(colorTheme);
    const palette = darkMode ? themePalettes.dark : themePalettes.light;

    const freezeChordsEnabled = useMemo(() => {
        if (ctxFreezeChords !== undefined) {
            return ctxFreezeChords;
        }
        const saved = localStorage.getItem(FREEZE_CHORDS_STORAGE_KEY);
        return saved !== null ? saved === 'true' : true;
    }, [ctxFreezeChords]);

    const [songModalVisible, setSongModalVisible] = useState(false);
    const [strumModalVisible, setStrumModalVisible] = useState(false);
    const [selectedDiagramChord, setSelectedDiagramChord] = useState(null);
    const [activeTranslationLang, setActiveTranslationLang] = useState(null);
    const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
    const [songData, setSongData] = useState(null);
    const [bandName, setBandName] = useState('');
    const [featuringBands, setFeaturingBands] = useState([]);
    const [sheetBgColor, setSheetBgColor] = useState('var(--bg-primary, #f3f4f6)');
    const [metroState, setMetroState] = useState(() => getMetronomeState());

    // Phase 2 Song Chord & 6-String Arpeggio Sequencer state
    const effectiveInstrument = fakeUkeEnabled ? 'ukulele' : chordInstrument;
    const [strumPresetId, setStrumPresetId] = useState('quarter');
    const [strumTracks, setStrumTracks] = useState(() =>
        buildStrumPresetTracks('quarter', effectiveInstrument).tracks
    );
    const [chordPlayActive, setChordPlayActive] = useState(false);
    const [activeChordSeqIdx, setActiveChordSeqIdx] = useState(null);
    const [activeBeatInChord, setActiveBeatInChord] = useState(0);
    const [activeStepInBar, setActiveStepInBar] = useState(-1);
    const playCursorRef = useRef({ seqIdx: 0, stepInChord: 0 });

    useEffect(() => {
        const expectedLen = effectiveInstrument === 'ukulele' ? 4 : 6;
        if (strumTracks.length !== expectedLen) {
            const preset = buildStrumPresetTracks(
                strumPresetId || 'quarter',
                effectiveInstrument
            );
            setStrumTracks(preset.tracks);
        }
    }, [effectiveInstrument, strumPresetId, strumTracks.length]);

    const handleSelectStrumPreset = (nextPresetId) => {
        const built = buildStrumPresetTracks(nextPresetId, effectiveInstrument);
        setStrumPresetId(nextPresetId);
        setStrumTracks(built.tracks);
        playCursorRef.current.stepInChord = 0;
    };

    const handleToggleStrumDot = (sIdx, stepIdx) => {
        setStrumPresetId('custom');
        setStrumTracks((prev) =>
            prev.map((row, idx) => {
                if (idx !== sIdx) return row;
                const nextSteps = [...row.steps];
                nextSteps[stepIdx] = !nextSteps[stepIdx];
                return { ...row, steps: nextSteps };
            })
        );
    };

    const handleChangeStepsPerBar = (nextCount) => {
        setStrumPresetId('custom');
        setStrumTracks((prev) => resizeStrumTracks(prev, nextCount));
        playCursorRef.current.stepInChord = 0;
    };

    useEffect(() => {
        return subscribeMetronomeState((st) => setMetroState(st));
    }, []);

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
        setChordPlayActive(false);
        setActiveChordSeqIdx(null);
        setActiveStepInBar(-1);

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

    const beatsPerBar = useMemo(
        () => parseBeatsPerBar(songData?.time_signature),
        [songData]
    );

    const effectiveSongBpm = useMemo(() => {
        const rawBpm = Number(songData?.bpm || 0);
        if (rawBpm >= 30 && rawBpm <= 260) return rawBpm;
        return metroState.bpm || 120;
    }, [songData, metroState.bpm]);

    const chordSequence = useMemo(() => {
        if (!songData) return [];
        return buildSongChordSequence({
            displayedLyrics,
            isCrawlerOrigin: Number(songData.origin_id || 0) > 0,
            visualOffset,
            songUseFlats,
            beatsPerBar,
        });
    }, [songData, displayedLyrics, visualOffset, songUseFlats, beatsPerBar]);

    const stepsPerBar = Math.max(1, strumTracks[0]?.steps?.length || 4);

    const playbackParamsRef = useRef({});
    playbackParamsRef.current = {
        chordSequence,
        strumTracks,
        stepsPerBar,
        beatsPerBar,
        instrument: chordInstrument,
        customVoicings: transposedCustomVoicings,
        songCapo,
        songTuning: songData?.tuning || null,
        vocalTransposition: transposition,
        visualOffset,
        compensateCapo,
        fakeUkeEnabled,
        bpm: effectiveSongBpm,
        soundMode: metroState.soundMode || 'natural',
    };

    const scrollActiveChordIntoView = (seqIdx) => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const el = container.querySelector(`[data-chord-seq-idx="${seqIdx}"]`);
        if (!el) return;
        const containerRect = container.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const relTop = elRect.top - containerRect.top;
        if (relTop < 56 || relTop > containerRect.height * 0.72) {
            container.scrollTo({
                top: Math.max(0, container.scrollTop + relTop - containerRect.height * 0.28),
                behavior: 'smooth',
            });
        }
    };

    useEffect(() => {
        if (!chordPlayActive) {
            return;
        }
        const { chordSequence: seq } = playbackParamsRef.current;
        if (!seq || seq.length === 0) {
            setChordPlayActive(false);
            return;
        }

        const fireCurrentSubStep = () => {
            const params = playbackParamsRef.current;
            const list = params.chordSequence;
            if (!list || list.length === 0) {
                setChordPlayActive(false);
                return;
            }

            let { seqIdx, stepInChord } = playCursorRef.current;
            if (seqIdx < 0 || seqIdx >= list.length) {
                setChordPlayActive(false);
                setActiveChordSeqIdx(null);
                setActiveStepInBar(-1);
                playCursorRef.current = { seqIdx: 0, stepInChord: 0 };
                return;
            }

            const currentItem = list[seqIdx];
            const totalStepsForChord = Math.max(
                1,
                Math.round(
                    (currentItem.beats / params.beatsPerBar) * params.stepsPerBar
                )
            );
            const startStepInBar = Math.round(
                ((currentItem.startBeatInBar || 0) / params.beatsPerBar) *
                    params.stepsPerBar
            );
            const currentStepInBar =
                (startStepInBar + stepInChord) % params.stepsPerBar;
            const currentBeatInChord = Math.min(
                currentItem.beats - 1,
                Math.floor(
                    (stepInChord / totalStepsForChord) * currentItem.beats
                )
            );

            setActiveChordSeqIdx(seqIdx);
            setActiveBeatInChord(currentBeatInChord);
            setActiveStepInBar(currentStepInBar);

            if (stepInChord === 0) {
                scrollActiveChordIntoView(seqIdx);
            }

            triggerPatternStepOnChord(currentItem, {
                stepInBar: currentStepInBar,
                stepInChord,
                strumTracks: params.strumTracks,
                instrument: params.instrument,
                customVoicings: params.customVoicings,
                songCapo: params.songCapo,
                songTuning: params.songTuning,
                vocalTransposition: params.vocalTransposition,
                visualOffset: params.visualOffset,
                compensateCapo: params.compensateCapo,
                fakeUkeEnabled: params.fakeUkeEnabled,
                bpm: params.bpm,
                beatsPerBar: params.beatsPerBar,
                soundMode: params.soundMode,
            });

            const nextStep = stepInChord + 1;
            if (nextStep < totalStepsForChord) {
                playCursorRef.current = { seqIdx, stepInChord: nextStep };
            } else {
                playCursorRef.current = { seqIdx: seqIdx + 1, stepInChord: 0 };
            }
        };

        fireCurrentSubStep();

        const barDurationMs =
            (60 / Math.max(30, effectiveSongBpm)) * beatsPerBar * 1000;
        const stepIntervalMs = barDurationMs / Math.max(1, stepsPerBar);
        const timerId = setInterval(fireCurrentSubStep, stepIntervalMs);
        return () => clearInterval(timerId);
    }, [chordPlayActive, effectiveSongBpm, beatsPerBar, stepsPerBar]);

    const handleToggleChordPlay = () => {
        if (chordPlayActive) {
            setChordPlayActive(false);
            setActiveChordSeqIdx(null);
            setActiveBeatInChord(0);
            setActiveStepInBar(-1);
        } else {
            if (
                playCursorRef.current.seqIdx < 0 ||
                playCursorRef.current.seqIdx >= chordSequence.length
            ) {
                playCursorRef.current = { seqIdx: 0, stepInChord: 0 };
            }
            setChordPlayActive(true);
        }
    };

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

    const songScreenItems = useMemo(() => {
        const handleChordTap = (chordTokenStr, seqIdx) => {
            if (chordPlayActive && typeof seqIdx === 'number' && seqIdx >= 0) {
                playCursorRef.current = { seqIdx, stepInChord: 0 };
                setActiveChordSeqIdx(seqIdx);
                setActiveBeatInChord(0);
                const item = chordSequence[seqIdx];
                if (item) {
                    const params = playbackParamsRef.current;
                    const startStepInBar = Math.round(
                        ((item.startBeatInBar || 0) / params.beatsPerBar) *
                            params.stepsPerBar
                    );
                    setActiveStepInBar(startStepInBar);
                    triggerPatternStepOnChord(item, {
                        stepInBar: startStepInBar,
                        stepInChord: 0,
                        ...params,
                    });
                    const totalStepsForChord = Math.max(
                        1,
                        Math.round(
                            (item.beats / params.beatsPerBar) *
                                params.stepsPerBar
                        )
                    );
                    playCursorRef.current = {
                        seqIdx: totalStepsForChord > 1 ? seqIdx : seqIdx + 1,
                        stepInChord: totalStepsForChord > 1 ? 1 : 0,
                    };
                }
                return;
            }
            if (chordDiagramsEnabled) {
                setSelectedDiagramChord(chordTokenStr);
            }
        };

        return buildSongSheetElements({
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
            onChordTap:
                chordDiagramsEnabled || chordPlayActive ? handleChordTap : null,
            activeChordSeqIdx: chordPlayActive ? activeChordSeqIdx : null,
            sheetBgColor,
            palette,
        });
    }, [
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
        chordPlayActive,
        activeChordSeqIdx,
        chordSequence,
        sheetBgColor,
        palette,
    ]);

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

    const currentPlayingItem =
        chordPlayActive &&
        activeChordSeqIdx !== null &&
        chordSequence[activeChordSeqIdx]
            ? chordSequence[activeChordSeqIdx]
            : null;

    return (
        <>
            <header className="app-header" style={{ position: 'relative', zIndex: 20000 }}>
                <div className="header-left">
                    <button
                        className="icon-btn"
                        onClick={() => {
                            setChordPlayActive(false);
                            onBack();
                        }}>
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

                    {/* Phase 2 Split Pill: [ Play/Stop Chords | Open 6-String Arpeggio Roll ] */}
                    {chordSequence.length > 0 && (
                        <div
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                borderRadius: 8,
                                border: chordPlayActive
                                    ? '1px solid #dc2626'
                                    : '1px solid var(--border-color)',
                                background: chordPlayActive
                                    ? '#dc2626'
                                    : 'var(--bg-primary)',
                                overflow: 'hidden',
                            }}>
                            <button
                                type="button"
                                title={
                                    chordPlayActive
                                        ? `Stop Chord Playback (${effectiveSongBpm} BPM) — tap any chord in lyrics to jump`
                                        : `Play Song Chords at ${effectiveSongBpm} BPM`
                                }
                                onClick={handleToggleChordPlay}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    padding: '5px 7px',
                                    border: 'none',
                                    background: 'transparent',
                                    color: chordPlayActive
                                        ? '#ffffff'
                                        : 'var(--text-primary)',
                                    fontWeight: 700,
                                    fontSize: '0.75rem',
                                    cursor: 'pointer',
                                }}>
                                {chordPlayActive ? (
                                    <>
                                        <Square size={12} />
                                        {currentPlayingItem
                                            ? `${currentPlayingItem.displayedChord} (${activeBeatInChord + 1}/${currentPlayingItem.beats})`
                                            : 'Stop'}
                                    </>
                                ) : (
                                    <>
                                        <Music size={13} />
                                        Chords
                                    </>
                                )}
                            </button>

                            <button
                                type="button"
                                title="Edit 6-String Strum & Arpeggio Roll Pattern"
                                onClick={() => setStrumModalVisible(true)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '5px 6px',
                                    border: 'none',
                                    borderLeft: chordPlayActive
                                        ? '1px solid rgba(255,255,255,0.28)'
                                        : '1px solid var(--border-color)',
                                    background: 'transparent',
                                    color: chordPlayActive
                                        ? '#ffffff'
                                        : 'var(--text-secondary)',
                                    cursor: 'pointer',
                                }}>
                                <Sliders size={13} />
                            </button>
                        </div>
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

            <SongStrumModal
                visible={strumModalVisible}
                instrument={effectiveInstrument}
                onSelectInstrument={setChordInstrument}
                strumPresetId={strumPresetId}
                onSelectPreset={handleSelectStrumPreset}
                strumTracks={strumTracks}
                onToggleStrumDot={handleToggleStrumDot}
                onChangeStepsPerBar={handleChangeStepsPerBar}
                activeStepInBar={activeStepInBar}
                chordPlayActive={chordPlayActive}
                onToggleChordPlay={handleToggleChordPlay}
                effectiveSongBpm={effectiveSongBpm}
                currentPlayingChord={currentPlayingItem?.displayedChord || null}
                onClose={() => setStrumModalVisible(false)}
            />

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
