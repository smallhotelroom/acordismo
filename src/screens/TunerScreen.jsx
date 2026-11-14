/**
 * @file src/screens/TunerScreen.jsx
 * @version 1.0.3
 * 10-Button Reference Ear Tuner (6 Guitar strings + 4 Ukulele strings)
 * with Natural/Synth tone selector, optional hands-free Repeat Loop,
 * and theme-aware accent styling (Small Hotel Room / Original 2026).
 */
import React, { useContext, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Moon, Repeat, Square, Sun, Volume2 } from 'lucide-react';
import { AppContext } from '../shared/AppContext';
import {
    GUITAR_STRINGS,
    UKULELE_STRINGS,
    playNoteFrequency,
} from '../shared/audioEngine';

export const __version__ = '1.0.2';

const TUNER_SOUND_MODE_KEY = 'acordismo_tuner_sound_mode';

export default function TunerScreen({ onBack }) {
    const { darkMode, setDarkMode } = useContext(AppContext);

    const [soundMode, setSoundMode] = useState(() => {
        return localStorage.getItem(TUNER_SOUND_MODE_KEY) || 'natural';
    });
    const [loopEnabled, setLoopEnabled] = useState(false);
    const [activeStringId, setActiveStringId] = useState(null);

    const stopVoiceRef = useRef(null);
    const loopIntervalRef = useRef(null);

    const stopCurrentSound = () => {
        if (loopIntervalRef.current) {
            clearInterval(loopIntervalRef.current);
            loopIntervalRef.current = null;
        }
        if (stopVoiceRef.current) {
            stopVoiceRef.current();
            stopVoiceRef.current = null;
        }
        setActiveStringId(null);
    };

    useEffect(() => {
        return () => stopCurrentSound();
    }, []);

    const handleModeSelect = (nextMode) => {
        setSoundMode(nextMode);
        localStorage.setItem(TUNER_SOUND_MODE_KEY, nextMode);
    };

    const triggerString = (strObj, forceLoop = loopEnabled) => {
        // If looping and tapping the already-active string, toggle it off
        if (forceLoop && activeStringId === strObj.id) {
            stopCurrentSound();
            return;
        }

        stopCurrentSound();
        setActiveStringId(strObj.id);

        const playOnce = () => {
            if (stopVoiceRef.current) {
                stopVoiceRef.current();
            }
            stopVoiceRef.current = playNoteFrequency(strObj.freq, {
                mode: soundMode,
                duration: 3.0,
            });
        };

        playOnce();

        if (forceLoop) {
            loopIntervalRef.current = setInterval(playOnce, 2500);
        } else {
            const currentId = strObj.id;
            setTimeout(() => {
                setActiveStringId((prev) => (prev === currentId ? null : prev));
            }, 1800);
        }
    };

    const renderStringButton = (strObj) => {
        const isActive = activeStringId === strObj.id;
        return (
            <button
                key={strObj.id}
                type="button"
                onClick={() => triggerString(strObj)}
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '14px 10px',
                    borderRadius: 10,
                    border: isActive
                        ? '2px solid var(--accent-color)'
                        : '1px solid var(--border-color)',
                    background: isActive
                        ? 'rgba(var(--accent-rgb, 86, 148, 0), 0.14)'
                        : 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    transition: 'all 0.12s ease',
                    boxShadow: isActive
                        ? '0 0 0 3px rgba(var(--accent-rgb, 86, 148, 0), 0.2)'
                        : 'none',
                }}>
                <div
                    style={{
                        fontSize: '1.35rem',
                        fontWeight: 800,
                        color: isActive
                            ? 'var(--accent-color)'
                            : 'var(--text-primary)',
                    }}>
                    {strObj.label}
                </div>
                <div
                    style={{
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        color: 'var(--text-secondary)',
                        marginTop: 2,
                    }}>
                    {strObj.note} · {strObj.freq.toFixed(1)} Hz
                </div>
            </button>
        );
    };

    return (
        <>
            <header className="app-header">
                <div className="header-left">
                    <button className="icon-btn" onClick={onBack}>
                        <ArrowLeft size={22} />
                    </button>
                    <h1 className="header-title">SHR Tuner</h1>
                </div>
                <div className="header-actions">
                    {activeStringId && (
                        <button
                            className="icon-btn"
                            title="Stop Sound"
                            onClick={stopCurrentSound}>
                            <Square size={18} />
                        </button>
                    )}
                    <button
                        className="icon-btn"
                        title="Toggle Dark Mode"
                        onClick={() => setDarkMode(!darkMode)}>
                        {darkMode ? <Sun size={20} /> : <Moon size={20} />}
                    </button>
                </div>
            </header>

            <main className="content-scroll" style={{ padding: 16 }}>
                {/* Sound & Loop Controls Bar */}
                <div
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-surface)',
                        marginBottom: 18,
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Volume2 size={18} />
                        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Tone:</span>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                            {['natural', 'synth'].map((m) => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => handleModeSelect(m)}
                                    style={{
                                        padding: '5px 12px',
                                        borderRadius: 999,
                                        fontWeight: 700,
                                        fontSize: '0.82rem',
                                        textTransform: 'capitalize',
                                        border:
                                            soundMode === m
                                                ? '1px solid var(--accent-color)'
                                                : '1px solid var(--border-color)',
                                        background:
                                            soundMode === m
                                                ? 'var(--accent-color)'
                                                : 'transparent',
                                        color:
                                            soundMode === m
                                                ? '#ffffff'
                                                : 'var(--text-primary)',
                                        cursor: 'pointer',
                                    }}>
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            const nextLoop = !loopEnabled;
                            setLoopEnabled(nextLoop);
                            if (!nextLoop && loopIntervalRef.current) {
                                stopCurrentSound();
                            }
                        }}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 12px',
                            borderRadius: 999,
                            fontWeight: 700,
                            fontSize: '0.82rem',
                            border: loopEnabled
                                ? '1px solid var(--accent-color)'
                                : '1px solid var(--border-color)',
                            background: loopEnabled
                                ? 'var(--accent-color)'
                                : 'transparent',
                            color: loopEnabled ? '#ffffff' : 'var(--text-primary)',
                            cursor: 'pointer',
                        }}>
                        <Repeat size={15} />
                        {loopEnabled ? 'Loop: ON' : 'Loop: OFF'}
                    </button>
                </div>

                {/* Guitar 6 Strings Section */}
                <div style={{ marginBottom: 22 }}>
                    <div
                        style={{
                            fontWeight: 800,
                            fontSize: '1rem',
                            marginBottom: 10,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'baseline',
                        }}>
                        <span>Guitar (6 Strings)</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                            Standard E A D G B E
                        </span>
                    </div>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: 10,
                        }}>
                        {GUITAR_STRINGS.map(renderStringButton)}
                    </div>
                </div>

                {/* Ukulele 4 Strings Section */}
                <div>
                    <div
                        style={{
                            fontWeight: 800,
                            fontSize: '1rem',
                            marginBottom: 10,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'baseline',
                        }}>
                        <span>Ukulele (4 Strings)</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                            Standard G C E A
                        </span>
                    </div>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(2, 1fr)',
                            gap: 10,
                        }}>
                        {UKULELE_STRINGS.map(renderStringButton)}
                    </div>
                </div>
            </main>
        </>
    );
}
