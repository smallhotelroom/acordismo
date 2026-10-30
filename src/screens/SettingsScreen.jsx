/**
 * @file src/screens/SettingsScreen.jsx
 * @version 2.4.0
 */
import React, { useContext, useRef } from 'react';
import { ArrowLeft, Moon, RotateCcw, Sun, Upload } from 'lucide-react';
import { loadExternalDatabaseFile, resetToDefaultDatabase } from '../shared/database';
import { AppContext } from '../shared/AppContext';

export const __version__ = '2.4.0';

export default function SettingsScreen({ onBack }) {
    const {
        transposition,
        setTransposition,
        darkMode,
        setDarkMode,
        activeDbLabel,
        setActiveDbLabel,
        setDbRevision,
    } = useContext(AppContext);

    const fileInputRef = useRef(null);

    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) {
            return;
        }
        try {
            await loadExternalDatabaseFile(file);
            setActiveDbLabel(file.name);
            setDbRevision((r) => r + 1);
        } catch (err) {
            console.error('Failed to load external database:', err);
        }
    };

    const handleResetDb = async () => {
        try {
            await resetToDefaultDatabase();
            setActiveDbLabel('Default (Small Hotel Room)');
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
            </header>

            <main className="content-scroll">
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 15,
                        borderBottom: '1px solid var(--border-color)',
                    }}>
                    <div>
                        <strong>Appearance (Stage Mode)</strong>
                        <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                            {darkMode ? 'Dark mode enabled' : 'Light mode enabled'}
                        </div>
                    </div>
                    <button
                        className="btn-primary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        onClick={() => setDarkMode(!darkMode)}>
                        {darkMode ? <Sun size={16} /> : <Moon size={16} />}
                        {darkMode ? 'Switch to Light' : 'Switch to Dark'}
                    </button>
                </div>

                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 15,
                        gap: 10,
                    }}>
                    <div style={{ flex: 4 }}>Transposition: {transposition}</div>
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
                    <button className="btn-primary" onClick={() => setTransposition(0)}>
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

                {/* Songbook Database Pack Loader (Local / Offline Extension) */}
                <div style={{ padding: 15, borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: 8 }}>
                        Songbook Database Pack
                    </div>
                    <div style={{ marginBottom: 12, fontSize: '0.9rem' }}>
                        Active DB: <strong>{activeDbLabel}</strong>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".db,.sqlite,.sqlite3"
                            style={{ display: 'none' }}
                            onChange={handleFileUpload}
                        />
                        <button
                            className="btn-primary"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                            onClick={() => fileInputRef.current?.click()}>
                            <Upload size={16} /> Load External .db Pack
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
