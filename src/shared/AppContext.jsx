/**
 * @file src/shared/AppContext.jsx
 * @version 2.9.0
 */
import React, { createContext, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { getSavedDbLabel, loadExternalDatabaseBytes } from './database';

export const __version__ = '2.9.0';

export const AppContext = createContext(null);

const TOP_SPACE_STORAGE_KEY = Capacitor.isNativePlatform()
    ? 'acordismo_top_space_native'
    : 'acordismo_top_space_web';

const FREEZE_CHORDS_STORAGE_KEY = 'acordismo_freeze_chords';
const DEFAULT_FONT_SIZE_STORAGE_KEY = 'acordismo_default_font_size';

export function AppProvider({ children }) {
    const [transposition, setTransposition] = useState(0);
    const [darkMode, setDarkMode] = useState(() => {
        return localStorage.getItem('acordismo_dark_mode') === 'true';
    });
    const [topSpaceEnabled, setTopSpaceEnabled] = useState(() => {
        const saved = localStorage.getItem(TOP_SPACE_STORAGE_KEY);
        if (saved !== null) {
            return saved === 'true';
        }
        // Default ON for native mobile apps (Android/iOS), OFF for desktop/web browsers
        return Capacitor.isNativePlatform();
    });
    const [freezeChordsEnabled, setFreezeChordsEnabled] = useState(() => {
        const saved = localStorage.getItem(FREEZE_CHORDS_STORAGE_KEY);
        return saved !== null ? saved === 'true' : true;
    });
    const [defaultFontSize, setDefaultFontSize] = useState(() => {
        const saved = parseInt(localStorage.getItem(DEFAULT_FONT_SIZE_STORAGE_KEY), 10);
        return !Number.isNaN(saved) && saved >= 10 && saved <= 36 ? saved : 14;
    });
    const [currentTab, setCurrentTab] = useState('Playlists');
    const [tabOrders, setTabOrders] = useState({
        Playlists: 'Original',
        Bands: 'ASC',
        Songs: 'ASC',
    });
    const [homeSearchVisible, setHomeSearchVisible] = useState(false);
    const [homeSearchStr, setHomeSearchStr] = useState('');
    const [homeModalVisible, setHomeModalVisible] = useState(false);
    const [activeDbLabel, setActiveDbLabel] = useState('Default (Small Hotel Room)');
    const [dbRevision, setDbRevision] = useState(0);

    useEffect(() => {
        getSavedDbLabel().then((label) => {
            setActiveDbLabel(label);
        });
    }, []);

    // Handle external .db files opened via Android "Open with Acordismo" or "Share to Acordismo"
    useEffect(() => {
        const importIncomingDbPayload = async (payload) => {
            if (!payload) {
                return;
            }
            try {
                let bytes = null;
                if (payload.path) {
                    const fileUrl = Capacitor.convertFileSrc(payload.path);
                    const response = await fetch(fileUrl);
                    if (!response.ok) {
                        throw new Error(`Failed to fetch streamed DB: ${response.statusText}`);
                    }
                    const buffer = await response.arrayBuffer();
                    bytes = new Uint8Array(buffer);
                } else if (payload.base64) {
                    const binaryString = window.atob(payload.base64);
                    const len = binaryString.length;
                    bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                }

                if (bytes) {
                    await loadExternalDatabaseBytes(bytes, payload.name || 'shared-pack.db');
                    const nextLabel = await getSavedDbLabel();
                    setActiveDbLabel(nextLabel);
                    setDbRevision((r) => r + 1);
                }
            } catch (err) {
                console.error('Failed to import shared database:', err);
            }
        };

        if (window.__acordismoPendingDb) {
            const pending = window.__acordismoPendingDb;
            window.__acordismoPendingDb = null;
            importIncomingDbPayload(pending);
        }

        const handleOpenDbEvent = (e) => {
            window.__acordismoPendingDb = null;
            importIncomingDbPayload(e.detail);
        };

        window.addEventListener('acordismo-open-db', handleOpenDbEvent);
        return () => window.removeEventListener('acordismo-open-db', handleOpenDbEvent);
    }, []);

    useEffect(() => {
        localStorage.setItem('acordismo_dark_mode', String(darkMode));
        document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    }, [darkMode]);

    useEffect(() => {
        localStorage.setItem(TOP_SPACE_STORAGE_KEY, String(topSpaceEnabled));
        document.documentElement.setAttribute(
            'data-top-space',
            topSpaceEnabled ? 'true' : 'false'
        );
        document.documentElement.setAttribute(
            'data-bottom-space',
            topSpaceEnabled ? 'true' : 'false'
        );
    }, [topSpaceEnabled]);

    useEffect(() => {
        localStorage.setItem(FREEZE_CHORDS_STORAGE_KEY, String(freezeChordsEnabled));
    }, [freezeChordsEnabled]);

    useEffect(() => {
        localStorage.setItem(DEFAULT_FONT_SIZE_STORAGE_KEY, String(defaultFontSize));
    }, [defaultFontSize]);

    return (
        <AppContext.Provider
            value={{
                transposition,
                setTransposition,
                darkMode,
                setDarkMode,
                topSpaceEnabled,
                setTopSpaceEnabled,
                bottomSpaceEnabled: topSpaceEnabled,
                setBottomSpaceEnabled: setTopSpaceEnabled,
                freezeChordsEnabled,
                setFreezeChordsEnabled,
                defaultFontSize,
                setDefaultFontSize,
                currentTab,
                setCurrentTab,
                tabOrders,
                setTabOrders,
                homeSearchVisible,
                setHomeSearchVisible,
                homeSearchStr,
                setHomeSearchStr,
                homeModalVisible,
                setHomeModalVisible,
                activeDbLabel,
                setActiveDbLabel,
                dbRevision,
                setDbRevision,
            }}>
            {children}
        </AppContext.Provider>
    );
}
