/**
 * @file src/screens/SettingsScreen.jsx
 * @version 3.2.0
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
import { AppContext } from '../shared/AppContext';

export const __version__ = '3.2.0';

export const FREEZE_CHORDS_STORAGE_KEY = 'acordismo_freeze_chords';

export default function SettingsScreen({ onBack }) {
    const {
        transposition,
        setTransposition,
        darkMode,
        setDarkMode,
        topSpaceEnabled,
        setTopSpaceEnabled,
        freezeChordsEnabled: ctxFreezeChords,
        setFreezeChordsEnabled: ctxSetFreezeChords,
        activeDbLabel,
        setActiveDbLabel,
        dbRevision,
        setDbRevision,
    } = useContext(AppContext);

    const [localFreezeChords, setLocalFreezeChords] = useState(() => {
        const saved = localStorage.getItem(FREEZE_CHORDS_STORAGE_KEY);
        return saved !== null ? saved === 'true' : true;
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

    const fileInputRef = useRef(null);
    const [layerStack, setLayerStack] = useState([]);

    const refreshStackState = async () => {
        const stack = await getDatabaseLayerStack();
        const label = await getSavedDbLabel();
        setLayerStack(stack);
        setActiveDbLabel(label);
    };

    // Refresh stack both on mount and whenever Android native streaming finishes importing a file
    useEffect(() => {
        refreshStackState();
    }, [dbRevision]);

    const handleAddPackClick = () => {
        if (
            typeof window !== 'undefined' &&
            window.AcordismoNative &&
            typeof window.AcordismoNative.pickDatabaseFile === 'function'
        ) {
            window.AcordismoNative.pickDatabaseFile();
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
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 15,
                        gap: 10,
                    }}>
                    <div style={{ flex: 4 }}>
                        <strong>Transposition:</strong> {transposition}
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
                        onClick={() => setTransposition(0)}>
                        RESET
                    </button>
                </div>

                <div style={{ padding: '0 15px 15px 15px' }}>
                    <div>Examples:</div>
                    <div>{'\u2022'} Song says Capo on 2, but play without capo: 2</div>
                    <div>{'\u2022'} Song says Drop 2, but play without untuning: -2</div>
                </div>

                <div
                    style={{
                        padding: '0 15px 15px 15px',
                        borderBottom: '1px solid var(--border-color)',
                    }}>
                    <div>Examples for Ukelele:</div>
                    <div>{'\u2022'} Play most songs on Ukelele: -5</div>
                    <div>{'\u2022'} Play song on Ukelele, but song says Capo on 2: -3</div>
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

                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 15,
                        borderBottom: '1px solid var(--border-color)',
                    }}>
                    <div>
                        <strong>Top Status Bar Space</strong>
                        <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                            {topSpaceEnabled
                                ? 'Enabled (avoids camera cutout / status bar)'
                                : 'Disabled (full-height header)'}
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
                                        style={{ width: 18, height: 18, cursor: 'pointer' }}
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
                                            {layer.songCount} songs · {layer.bandCount} bands
                                            {layer.builtin ? ' · Built-in' : ''}
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
            </main>
        </>
    );
}
