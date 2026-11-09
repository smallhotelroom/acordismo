/**
 * @file src/screens/SongScreen.jsx
 * @version 2.37.0
 */
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Pause, Play } from 'lucide-react';
import executeQuery from '../shared/database';
import { AppContext } from '../shared/AppContext';
import { FREEZE_CHORDS_STORAGE_KEY } from './SettingsScreen';
import { MetronomeIcon } from './HomeScreen';
import ChordDiagramPopover from '../components/ChordDiagramPopover';
import {
    buildTransposedCustomVoicings,
    parseSongSections,
} from '../shared/songSections';
import {
    getMetronomeState,
    setMetronomeBpm,
    setMetronomePlaying,
    subscribeMetronomeState,
} from '../shared/audioEngine';
import {
    CHORD_GROUP_DELIMITER_REGEX,
    DIRECTIVE_PAREN_REGEX,
    SYNTAX_PALETTE,
    isValidParenChordGroup,
    parseChordToken,
    transposeChordToken,
} from '@shr-shared/chordTransposer.js';
import { parseInstrumentTuning } from '../../../smallhotelroom.github.io/src/shared/songSchema.js';
import {
    deduceAcordismoSongKey,
    deduceAcordismoSongKeyInfo,
    deduceAcordismoSongUseFlats,
    isCrawlerChordLine,
    isStandaloneChordLine,
    stripCrawlerTabSections,
    stripOuterPunctuation,
} from '../shared/crawlerTransposer';

export const __version__ = '2.37.0';

const SCROLL_SPEED_STORAGE_KEY = 'acordismo_scroll_speed';
const TARGET_DURATION_SECONDS = 210; // 3 minutes 30 seconds at 1.0x

/**
 * Formats initNote: only Setting 3 (`vocalTransposition`) affects the singing pitch & initNote!
 * Settings 1 (Compensate Capo/Drop) and 2 (Fake Uke -5) leave initNote untouched.
 */
function formatInitNoteDisplay(rawInitNote, vocalTransposition, useFlats) {
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

/**
 * Renders a crawler chord line (e.g. "Intro: A B C F# (I will learn this better)" or "Am  F  C  G").
 */
function renderCrawlerChordLineNodes(
    lineText,
    visualOffset,
    useFlats,
    palette,
    startKey,
    onChordClick
) {
    const nodes = [];
    let keyCounter = startKey;
    const tokenRegex = /(\S+)|(\s+)/g;
    let match;

    while ((match = tokenRegex.exec(lineText)) !== null) {
        const [, rawWord, spaceRun] = match;
        if (spaceRun) {
            nodes.push(<span key={keyCounter++}>{spaceRun}</span>);
        } else if (rawWord) {
            const { prefix, core, suffix } = stripOuterPunctuation(rawWord);
            if (core && parseChordToken(core) !== null) {
                if (prefix) {
                    nodes.push(<span key={keyCounter++}>{prefix}</span>);
                }
                const transposedChord = transposeChordToken(core, visualOffset, useFlats);
                nodes.push(
                    <strong
                        key={keyCounter++}
                        style={{
                            color: palette.chord,
                            cursor: onChordClick ? 'pointer' : 'inherit',
                        }}
                        onClick={
                            onChordClick
                                ? (e) => {
                                      e.stopPropagation();
                                      onChordClick(transposedChord);
                                  }
                                : undefined
                        }>
                        {transposedChord}
                    </strong>
                );
                if (suffix) {
                    nodes.push(<span key={keyCounter++}>{suffix}</span>);
                }
            } else {
                nodes.push(<span key={keyCounter++}>{rawWord}</span>);
            }
        }
    }

    return { nodes, nextKey: keyCounter };
}

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

    useEffect(() => {
        setFontSize(defaultFontSize);
    }, [defaultFontSize]);

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

    // Total semitone shift applied to displayed chord names:
    // (1) Compensate Capo/Drop + (2) Fake Uke (-5) + (3) Vocal Transposition
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

    // Shift song-specific `## Chords` / `## Fingerings` postures by visualOffset
    const transposedCustomVoicings = useMemo(
        () =>
            buildTransposedCustomVoicings(
                parsedSections.customVoicings,
                visualOffset,
                songUseFlats
            ),
        [parsedSections.customVoicings, visualOffset, songUseFlats]
    );

    // Deduce key guess + confidence % when frontmatter `key` is absent
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
        if (!songData) {
            return [];
        }

        const handleChordTap = chordDiagramsEnabled
            ? (chordTokenStr) => setSelectedDiagramChord(chordTokenStr)
            : null;

        const preChordItems = [];
        const sections = [];
        let currentSection = null;

        if (!activeTranslationObj) {
            const topDirectives = [];
            if (songCapo !== 0) {
                const origCapoDesc =
                    songCapo < 0
                        ? `drop ${-songCapo} semitones`
                        : `capo on ${songCapo}`;
                if (fakeUkeEnabled) {
                    topDirectives.push(
                        `(guitar shapes for ukulele [-5]; compensated for ${origCapoDesc})`
                    );
                } else if (compensateCapo) {
                    topDirectives.push(
                        `(chords compensated for no ${songCapo < 0 ? 'drop' : 'capo'}; originally ${origCapoDesc})`
                    );
                } else {
                    topDirectives.push(`(chords for ${origCapoDesc})`);
                }
            } else if (fakeUkeEnabled) {
                topDirectives.push(`(guitar shapes for ukulele [-5 semitones])`);
            }

            if (parsedTuning) {
                topDirectives.push(`(tuning: ${parsedTuning.displayStr})`);
            }

            if (topDirectives.length > 0) {
                preChordItems.push(
                    <strong key="top-directives" style={{ color: palette.directive }}>
                        {topDirectives.join('\n')}
                        {'\n\n'}
                    </strong>
                );
            }
        }

        const useFlats = songUseFlats;
        const isCrawlerOrigin = Number(songData.origin_id || 0) > 0;
        const lines = displayedLyrics.split('\n');
        let counter = 0;

        lines.forEach((lineText, lineIndex) => {
            const lineNodes = [];
            let hasChordsOnLine = false;

            if (isCrawlerOrigin) {
                if (isCrawlerChordLine(lineText)) {
                    hasChordsOnLine = true;
                    const { nodes, nextKey } = renderCrawlerChordLineNodes(
                        lineText,
                        visualOffset,
                        useFlats,
                        palette,
                        counter,
                        handleChordTap
                    );
                    lineNodes.push(...nodes);
                    counter = nextKey;
                } else {
                    lineNodes.push(
                        renderLyricWithChoir(lineText, palette.choir, counter++)
                    );
                }
            } else if (!lineText.includes('(') && isStandaloneChordLine(lineText)) {
                hasChordsOnLine = true;
                const { nodes, nextKey } = renderCrawlerChordLineNodes(
                    lineText,
                    visualOffset,
                    useFlats,
                    palette,
                    counter,
                    handleChordTap
                );
                lineNodes.push(...nodes);
                counter = nextKey;
            } else {
                const re1 = /\((.+?)\)/g;
                let array1;
                let outerLastIndex = 0;

                while ((array1 = re1.exec(lineText)) !== null) {
                    const chordGroup = array1[1];
                    const isDirectiveGroup = DIRECTIVE_PAREN_REGEX.test(chordGroup);
                    const isValidChords =
                        !isDirectiveGroup && isValidParenChordGroup(chordGroup);

                    if (!isDirectiveGroup && !isValidChords) {
                        continue;
                    }

                    lineNodes.push(
                        renderLyricWithChoir(
                            lineText.slice(outerLastIndex, re1.lastIndex - array1[0].length),
                            palette.choir,
                            counter
                        )
                    );

                    if (isDirectiveGroup) {
                        lineNodes.push(
                            <strong key={counter + 1} style={{ color: palette.directive }}>
                                ({chordGroup})
                            </strong>
                        );
                    } else {
                        hasChordsOnLine = true;
                        let remaining = chordGroup;
                        let innerDone = false;
                        const innerTokens = [];
                        let tokIdx = 0;

                        while (innerDone === false) {
                            const delimiter = CHORD_GROUP_DELIMITER_REGEX.exec(remaining);
                            if (delimiter !== null) {
                                const treatable = remaining.slice(0, delimiter.index);
                                const delimStr = delimiter[0];
                                remaining = remaining.slice(
                                    delimiter.index + delimStr.length,
                                    remaining.length
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
                                const transposedToken = transposeChordToken(
                                    treatable,
                                    visualOffset,
                                    useFlats
                                );
                                innerTokens.push(
                                    <span
                                        key={`ch-${tokIdx++}`}
                                        style={{
                                            color: palette.chord,
                                            cursor: handleChordTap ? 'pointer' : 'inherit',
                                        }}
                                        onClick={
                                            handleChordTap
                                                ? (e) => {
                                                      e.stopPropagation();
                                                      handleChordTap(transposedToken);
                                                  }
                                                : undefined
                                        }>
                                        {transposedToken}
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
                            if (remaining.length > 0) {
                                const transposedToken = transposeChordToken(
                                    remaining,
                                    visualOffset,
                                    useFlats
                                );
                                innerTokens.push(
                                    <span
                                        key={`ch-${tokIdx++}`}
                                        style={{
                                            color: palette.chord,
                                            cursor: handleChordTap ? 'pointer' : 'inherit',
                                        }}
                                        onClick={
                                            handleChordTap
                                                ? (e) => {
                                                      e.stopPropagation();
                                                      handleChordTap(transposedToken);
                                                  }
                                                : undefined
                                        }>
                                        {transposedToken}
                                    </span>
                                );
                            }
                            innerDone = true;
                        }

                        lineNodes.push(
                            <strong key={counter + 1}>
                                <span style={{ color: palette.parenSymbol }}>(</span>
                                {innerTokens}
                                <span style={{ color: palette.parenSymbol }}>)</span>
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
            setFontSize(Math.max(10, Math.min(36, Math.round(pinchStartSizeRef.current * scale))));
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

            {/* Chord Neck Diagram Overlay */}
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

            {songModalVisible && songData && (
                <div
                    className="modal-backdrop"
                    style={{ zIndex: 30000 }}
                    onClick={() => setSongModalVisible(false)}>
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
                                        transposition,
                                        songUseFlats
                                    )}
                                </div>
                            )}
                            {songData.time_signature && (
                                <div>Time signature: {songData.time_signature}</div>
                            )}
                            {songData.falsetto && <div>Falsetto: {songData.falsetto}</div>}
                            {songData.highest && <div>Highest: {songData.highest}</div>}
                            {(songData.lang || parsedSections.translations.length > 0) && (
                                <div>
                                    Lang:{' '}
                                    {parsedSections.translations.length === 0 ? (
                                        songData.lang
                                    ) : (
                                        <>
                                            <span
                                                onClick={() => selectLanguageView(null)}
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
                                                {parsedSections.primaryLang}
                                            </span>
                                            {parsedSections.translations.map((tr) => {
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
                                                                selectLanguageView(tr.lang)
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
                            <span>
                                Chord shift:{' '}
                                {visualOffset > 0 ? `+${visualOffset}` : visualOffset}
                                {transposition !== 0
                                    ? ` (vocal ${transposition > 0 ? `+${transposition}` : transposition})`
                                    : ''}
                            </span>
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
