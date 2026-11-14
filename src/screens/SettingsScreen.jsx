/**
 * @file src/screens/SettingsScreen.jsx
 * @version 3.13.0
 */
import React, { useContext, useEffect, useRef, useState } from 'react';
import {
    ArrowDown,
    ArrowLeft,
    ArrowUp,
    Moon,
    RotateCcw,
    Sun,
    Trash2,
    Upload,
} from 'lucide-react';
import {
    getDatabaseLayerStack,
    getSavedDbLabel,
    loadExternalDatabaseFile,
    moveDatabaseLayer,
    removeDatabaseLayer,
    resetToDefaultDatabase,
    toggleDatabaseLayer,
} from '../shared/database';
import { APP_DEFAULTS, AppContext } from '../shared/AppContext';
import { COLOR_THEMES } from '../shared/songSchema.js';
import pkg from '../../package.json';

export const __version__ = '3.13.0';

export const FREEZE_CHORDS_STORAGE_KEY = 'shr_freeze_chords';
export const HIDE_CRAWLER_TABS_STORAGE_KEY = 'shr_hide_crawler_tabs';

function formatLayerSubtitle(layer, hideCrawlerTabsEnabled) {
    const hasFilteredSongs =
        hideCrawlerTabsEnabled &&
        layer.chordSongCount !== undefined &&
        layer.chordSongCount !== layer.songCount;
    const songsPart = hasFilteredSongs
        ? `${layer.chordSongCount} songs (${layer.songCount} total)`
        : `${layer.songCount} songs`;

    const hasFilteredBands =
        hideCrawlerTabsEnabled &&
        layer.chordBandCount !== undefined &&
        layer.chordBandCount !== layer.bandCount;
    const bandsPart = hasFilteredBands
        ? `${layer.chordBandCount} bands`
        : `${layer.bandCount} bands`;

    const parts = [songsPart, bandsPart];
    if (layer.generatedAt) {
        parts.push(`Built ${String(layer.generatedAt).slice(0, 10)}`);
    }
    if (layer.gitCommit) {
        parts.push(`#${layer.gitCommit}`);
    }
    if (layer.schemaVersion) {
        parts.push(`v${layer.schemaVersion}`);
    }
    if (layer.builtin) {
        parts.push('Built-in');
    }
    return parts.join(' · ');
}

export default function SettingsScreen({ onBack }) {
    const {
        colorTheme = 'basic',
        setColorTheme,
        compensateCapo,
        setCompensateCapo,
        fakeUkeEnabled,
        setFakeUkeEnabled,
        transposition,
        setTransposition,
        darkMode,
        setDarkMode,
        topSpaceEnabled,
        setTopSpaceEnabled,
        freezeChordsEnabled: ctxFreezeChords,
        setFreezeChordsEnabled: ctxSetFreezeChords,
        hideCrawlerTabsEnabled,
        setHideCrawlerTabsEnabled,
        chordDiagramsEnabled,
        setChordDiagramsEnabled,
        chordInstrument,
        setChordInstrument,
        defaultFontSize,
        setDefaultFontSize,
        activeDbLabel,
        setActiveDbLabel,
        dbRevision,
        setDbRevision,
    } = useContext(AppContext);

    const [localFreezeChords, setLocalFreezeChords] = useState(() => {
        const saved = localStorage.getItem(FREEZE_CHORDS_STORAGE_KEY);
        return saved !== null
            ? saved === 'true'
            : Boolean(APP_DEFAULTS.default_freeze_chords);
    });

    const freezeChordsEnabled =
        ctxFreezeChords !== undefined ? ctxFreezeChords : localFreezeChords;

    const handleToggleFreezeChords = () => {
        const nextVal = !freezeChordsEnabled;
        localStorage.setItem(FREEZE_CHORDS_STORAGE_KEY, String(nextVal));
        setLocalFreezeChords(nextVal);
        if (ctxSetFreezeChords) {
            ctxSetFreezeChords(nextVal);
        }
    };

    const clampFontSize = (val) =>
        Math.max(
            APP_DEFAULTS.min_font_size,
            Math.min(APP_DEFAULTS.max_font_size, val)
        );

    const fileInputRef = useRef(null);
    const [layerStack, setLayerStack] = useState([]);

    const refreshStackState = async () => {
        const stack = await getDatabaseLayerStack();
        const label = await getSavedDbLabel();
        setLayerStack(stack);
        setActiveDbLabel(label);
    };

    useEffect(() => {
        refreshStackState();
    }, [dbRevision]);

    const handleAddPackClick = () => {
        if (
            typeof window !== 'undefined' &&
            window.ShrNative &&
            typeof window.ShrNative.pickDatabaseFile === 'function'
        ) {
            window.ShrNative.pickDatabaseFile();
            return;
        }
        fileInputRef.current?.click();
    };

    const handleFileUpload = async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) {
            return;
        }
        try {
            for (const file of files) {
                await loadExternalDatabaseFile(file);
            }
            await refreshStackState();
            setDbRevision((r) => r + 1);
        } catch (err) {
            console.error('Failed to load external database:', err);
        } finally {
            e.target.value = '';
        }
    };

    const handleToggleLayer = async (layerId) => {
        await toggleDatabaseLayer(layerId);
        await refreshStackState();
        setDbRevision((r) => r + 1);
    };

    const handleMoveLayer = async (layerId, direction) => {
        await moveDatabaseLayer(layerId, direction);
        await refreshStackState();
        setDbRevision((r) => r + 1);
    };

    const handleRemoveLayer = async (layerId) => {
        await removeDatabaseLayer(layerId);
        await refreshStackState();
        setDbRevision((r) => r + 1);
    };

    const handleResetDb = async () => {
        try {
            await resetToDefaultDatabase();
            await refreshStackState();
            setDbRevision((r) => r + 1);
        } catch (err) {
            console.error('Failed to reset database:', err);
        }
    };

    return (
        <>
            <header className="app-header">
                <div className="header-left">
                    <button className="icon-btn" onClick={onBack}>
                        <ArrowLeft size={22} />
                    </button>
                    <h1 className="header-title">Settings</h1>
                </div>
                <div className="header-actions">
                    <button
                        className="icon-btn"
                        title="Toggle Dark Mode"
                        onClick={() => setDarkMode(!darkMode)}>
                        {darkMode ? <Sun size={20} /> : <Moon size={20} />}
                    </button>
                </div>
            </header>

            <main className="content-scroll">
                {/* 0) Color Theme Selector (First item on SettingsScreen) */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 15,
                        gap: 10,
                        borderBottom: '1px solid var(--border-color)',
                    }}>
                    <div style={{ minWidth: 0 }}>
                        <strong>Color Theme</strong>
                        <div style={{ fontSize: '0.86rem', color: 'var(--text-secondary)' }}>
                            {colorTheme === 'shr'
                                ? 'Green palette'
                                : 'Blue palette'}
                        </div>
                    </div>
                    <div
                        style={{
                            display: 'inline-flex',
                            flexShrink: 0,
                            background: 'var(--bg-primary)',
                            padding: 3,
                            borderRadius: 8,
                            border: '1px solid var(--border-color)',
                        }}>
                        {COLOR_THEMES.map((themeOpt) => {
                            const active = colorTheme === themeOpt.id;
                            return (
                                <button
                                    key={themeOpt.id}
                                    type="button"
                                    onClick={() =>
                                        setColorTheme &&
                                        setColorTheme(themeOpt.id)
                                    }
                                    style={{
                                        padding: '6px 11px',
                                        borderRadius: 6,
                                        border: 'none',
                                        fontWeight: 700,
                                        fontSize: '0.82rem',
                                        background: active
                                            ? 'var(--accent-color)'
                                            : 'transparent',
                                        color: active
                                            ? '#ffffff'
                                            : 'var(--text-secondary)',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap',
                                    }}>
                                    {themeOpt.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 1) Compensate Capo / Drop / Alternate */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 15,
                        gap: 10,
                        borderBottom: '1px solid var(--border-color)',
                    }}>
                    <div>
                        <strong>Compensate Capo / Drop / Alternate</strong>
                        <div style={{ fontSize: '0.86rem', color: 'var(--text-secondary)' }}>
                            {compensateCapo
                                ? fakeUkeEnabled
                                    ? 'Enabled (forced ON while Guitar Shapes on Ukulele is active)'
                                    : 'Enabled (shifts capo/drop chords & reverts alternate-tuning diagrams to standard postures)'
                                : 'Disabled (displays original written chords & alternate-tuning postures)'}
                        </div>
                    </div>
                    <button
                        className="btn-primary"
                        disabled={fakeUkeEnabled}
                        style={{ opacity: fakeUkeEnabled ? 0.5 : 1 }}
                        onClick={() => setCompensateCapo(!compensateCapo)}>
                        {compensateCapo ? 'Disable' : 'Enable'}
                    </button>
                </div>

                {/* 2) Guitar Shapes on Ukulele ("Fake Uke" -5 semitones) */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 15,
                        gap: 10,
                        borderBottom: '1px solid var(--border-color)',
                    }}>
                    <div>
                        <strong>Guitar Shapes on Ukulele (-5)</strong>
                        <div style={{ fontSize: '0.86rem', color: 'var(--text-secondary)' }}>
                            {fakeUkeEnabled
                                ? 'Enabled (depicts -5 semitone guitar names & locks diagrams to 4-string Ukulele shapes)'
                                : 'Disabled (normal chord names & instrument switcher)'}
                        </div>
                    </div>
                    <button
                        className="btn-primary"
                        onClick={() => setFakeUkeEnabled(!fakeUkeEnabled)}>
                        {fakeUkeEnabled ? 'Disable' : 'Enable'}
                    </button>
                </div>

                {/* 3) Vocal / Pitch Transposition */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 15,
                        gap: 10,
                        borderBottom: '1px solid var(--border-color)',
                    }}>
                    <div style={{ flex: 4 }}>
                        <strong>Vocal Transposition:</strong>{' '}
                        {transposition > 0 ? `+${transposition}` : transposition}
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            Shifts singing key, chord strumming pitch, and init note
                        </div>
                    </div>
                    <button
                        className="btn-primary"
                        onClick={() => setTransposition(transposition + 1)}>
                        UP
                    </button>
                    <button
                        className="btn-primary"
                        onClick={() => setTransposition(transposition - 1)}>
                        DOWN
                    </button>
                    <button
                        className="btn-primary"
                        onClick={() =>
                            setTransposition(APP_DEFAULTS.default_transposition)
                        }>
                        RESET
                    </button>
                </div>

                {/* Default Song Contents Font Size */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 15,
                        gap: 10,
                        borderBottom: '1px solid var(--border-color)',
                    }}>
                    <div style={{ flex: 4 }}>
                        <strong>Default Song Font Size:</strong> {defaultFontSize}px
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            Double-tap inside a song resets zoom to this size
                        </div>
                    </div>
                    <button
                        className="btn-primary"
                        onClick={() => setDefaultFontSize(clampFontSize(defaultFontSize + 1))}>
                        UP
                    </button>
                    <button
                        className="btn-primary"
                        onClick={() => setDefaultFontSize(clampFontSize(defaultFontSize - 1))}>
                        DOWN
                    </button>
                    <button
                        className="btn-primary"
                        onClick={() =>
                            setDefaultFontSize(APP_DEFAULTS.default_font_size)
                        }>
                        RESET
                    </button>
                </div>

                {/* Chord Diagrams on Tap Option */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 15,
                        gap: 10,
                        borderBottom: '1px solid var(--border-color)',
                    }}>
                    <div>
                        <strong>Chord Diagrams on Tap</strong>
                        <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                            {chordDiagramsEnabled
                                ? fakeUkeEnabled
                                    ? 'Enabled (locked to Ukulele 4-string diagrams while Guitar Shapes on Ukulele is ON)'
                                    : `Enabled (tap any chord in a song for ${chordInstrument === 'ukulele' ? 'Ukulele' : 'Guitar'} neck diagram)`
                                : 'Disabled'}
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {chordDiagramsEnabled && !fakeUkeEnabled && (
                            <button
                                className="btn-primary"
                                style={{ background: '#4b5563' }}
                                onClick={() =>
                                    setChordInstrument(
                                        chordInstrument === 'guitar' ? 'ukulele' : 'guitar'
                                    )
                                }>
                                {chordInstrument === 'guitar' ? 'Guitar' : 'Ukulele'}
                            </button>
                        )}
                        <button
                            className="btn-primary"
                            onClick={() => setChordDiagramsEnabled(!chordDiagramsEnabled)}>
                            {chordDiagramsEnabled ? 'Disable' : 'Enable'}
                        </button>
                    </div>
                </div>

                {/* Freeze Top Chord Row Option */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 15,
                        borderBottom: '1px solid var(--border-color)',
                    }}>
                    <div>
                        <strong>Freeze Top Chord Row</strong>
                        <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                            {freezeChordsEnabled
                                ? 'Enabled (keeps active chords pinned at top while scrolling)'
                                : 'Disabled (standard scrolling)'}
                        </div>
                    </div>
                    <button
                        className="btn-primary"
                        onClick={handleToggleFreezeChords}>
                        {freezeChordsEnabled ? 'Disable' : 'Enable'}
                    </button>
                </div>

                {/* Hide Crawler Tablatures & Tab-Only Songs Option */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 15,
                        borderBottom: '1px solid var(--border-color)',
                    }}>
                    <div>
                        <strong>Hide Crawler Tablatures &amp; Tab-Only Songs</strong>
                        <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                            {hideCrawlerTabsEnabled
                                ? 'Enabled (strips ASCII tab sections & hides chordless crawler tabs)'
                                : 'Disabled (shows raw ASCII tablatures & all crawler files)'}
                        </div>
                    </div>
                    <button
                        className="btn-primary"
                        onClick={() => setHideCrawlerTabsEnabled(!hideCrawlerTabsEnabled)}>
                        {hideCrawlerTabsEnabled ? 'Disable' : 'Enable'}
                    </button>
                </div>

                {/* Merged Top & Bottom System Bars Space + Song Gradient Toggle */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 15,
                        borderBottom: '1px solid var(--border-color)',
                    }}>
                    <div>
                        <strong>Top &amp; Bottom System Bars Space</strong>
                        <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                            {topSpaceEnabled
                                ? 'Enabled (top/bottom bars + song bottom fade)'
                                : 'Disabled (full-height screen edges)'}
                        </div>
                    </div>
                    <button
                        className="btn-primary"
                        onClick={() => setTopSpaceEnabled(!topSpaceEnabled)}>
                        {topSpaceEnabled ? 'Disable' : 'Enable'}
                    </button>
                </div>

                {/* N-Layer Songbook Database Priority Stack */}
                <div style={{ padding: 15, borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
                        Songbook Database Layers (Priority Order)
                    </div>
                    <div
                        style={{
                            marginBottom: 12,
                            fontSize: '0.85rem',
                            color: 'var(--text-secondary)',
                        }}>
                        Higher layers override duplicate songs in lower layers. Active:{' '}
                        <strong>{activeDbLabel}</strong>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                        {layerStack.map((layer, index) => (
                            <div
                                key={layer.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '10px 12px',
                                    borderRadius: 6,
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--bg-surface)',
                                    opacity: layer.enabled ? 1 : 0.55,
                                    gap: 8,
                                }}>
                                <label
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 10,
                                        flex: 1,
                                        minWidth: 0,
                                        cursor: 'pointer',
                                    }}>
                                    <input
                                        type="checkbox"
                                        checked={layer.enabled}
                                        onChange={() => handleToggleLayer(layer.id)}
                                        style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--accent-color)' }}
                                    />
                                    <div style={{ minWidth: 0 }}>
                                        <div
                                            style={{
                                                fontWeight: 700,
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                            }}>
                                            #{index + 1} {layer.name}
                                        </div>
                                        <div
                                            style={{
                                                fontSize: '0.8rem',
                                                color: 'var(--text-secondary)',
                                            }}>
                                            {formatLayerSubtitle(layer, hideCrawlerTabsEnabled)}
                                        </div>
                                    </div>
                                </label>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <button
                                        className="icon-btn"
                                        title="Move Priority Up"
                                        disabled={index === 0}
                                        style={{ opacity: index === 0 ? 0.3 : 1 }}
                                        onClick={() => handleMoveLayer(layer.id, -1)}>
                                        <ArrowUp size={18} />
                                    </button>
                                    <button
                                        className="icon-btn"
                                        title="Move Priority Down"
                                        disabled={index === layerStack.length - 1}
                                        style={{
                                            opacity: index === layerStack.length - 1 ? 0.3 : 1,
                                        }}
                                        onClick={() => handleMoveLayer(layer.id, 1)}>
                                        <ArrowDown size={18} />
                                    </button>
                                    {!layer.builtin && (
                                        <button
                                            className="icon-btn"
                                            title="Remove Layer"
                                            onClick={() => handleRemoveLayer(layer.id)}>
                                            <Trash2 size={18} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept=".db,.sqlite,.sqlite3"
                            style={{ display: 'none' }}
                            onChange={handleFileUpload}
                        />
                        <button
                            className="btn-primary"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                            onClick={handleAddPackClick}>
                            <Upload size={16} /> Add .db Layer Pack(s)
                        </button>
                        <button
                            className="btn-primary"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                background: '#4b5563',
                            }}
                            onClick={handleResetDb}>
                            <RotateCcw size={16} /> Reset to Default DB
                        </button>
                    </div>
                </div>

                {/* Discrete About & Versioning Footer */}
                <div
                    style={{
                        padding: '22px 15px 28px 15px',
                        textAlign: 'center',
                        color: 'var(--text-secondary)',
                        fontSize: '0.84rem',
                        lineHeight: 1.5,
                    }}>
                    <div>
                        Thank you for using the{' '}
                        <a
                            href="https://smallhotelroom.com"
                            target="_blank"
                            rel="noreferrer"
                            style={{
                                color: 'var(--text-secondary)',
                                textDecoration: 'underline',
                                fontWeight: 600,
                            }}>
                            Small Hotel Room
                        </a>{' '}
                        App!
                    </div>
                    <div>
                        <span>v{pkg.version || '0.2.0'}</span>
                    </div>
                </div>
            </main>
        </>
    );
}
