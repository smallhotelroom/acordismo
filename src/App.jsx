/**
 * @file src/App.jsx
 * @version 2.8.0
 */
import React, { useContext, useEffect, useRef, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { AppContext, AppProvider } from './shared/AppContext';
import HomeScreen from './screens/HomeScreen';
import BandScreen from './screens/BandScreen';
import PlaylistScreen from './screens/PlaylistScreen';
import SongScreen from './screens/SongScreen';
import SettingsScreen from './screens/SettingsScreen';

export const __version__ = '2.8.0';

function MainNavigator() {
    const { topSpaceEnabled, darkMode } = useContext(AppContext);
    const [history, setHistory] = useState([{ screen: 'Home', params: {} }]);
    const historyRef = useRef(history);

    useEffect(() => {
        historyRef.current = history;
    }, [history]);

    const currentRoute = history[history.length - 1];
    const isSongScreen = currentRoute.screen === 'Song';

    const navigate = (nextRoute) => {
        setHistory((prev) => [...prev, nextRoute]);
    };

    const goBack = () => {
        setHistory((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
    };

    useEffect(() => {
        const listenerPromise = CapacitorApp.addListener('backButton', () => {
            if (historyRef.current.length > 1) {
                setHistory((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
            } else {
                CapacitorApp.minimizeApp();
            }
        });

        return () => {
            listenerPromise.then((handle) => handle.remove());
        };
    }, []);

    const songSheetBg = darkMode ? '#121212' : '#f3f4f6';

    return (
        <div className="app-shell" style={{ position: 'relative' }}>
            {currentRoute.screen === 'Home' && <HomeScreen onNavigate={navigate} />}
            {currentRoute.screen === 'Band' && (
                <BandScreen
                    routeParams={currentRoute.params}
                    onNavigate={navigate}
                    onBack={goBack}
                />
            )}
            {currentRoute.screen === 'Playlist' && (
                <PlaylistScreen
                    routeParams={currentRoute.params}
                    onNavigate={navigate}
                    onBack={goBack}
                />
            )}
            {currentRoute.screen === 'Song' && (
                <SongScreen
                    routeParams={currentRoute.params}
                    onNavigate={navigate}
                    onBack={goBack}
                />
            )}
            {currentRoute.screen === 'Settings' && <SettingsScreen onBack={goBack} />}

            {/* 1. Clickable Screens (Home, Band, Playlist, Settings): 48px Opaque Surface Bar for high-contrast OS nav icons */}
            {topSpaceEnabled && !isSongScreen && (
                <div
                    style={{
                        flexShrink: 0,
                        height: '48px',
                        backgroundColor: 'var(--bg-surface)',
                        borderTop: '1px solid var(--border-color)',
                        zIndex: 90,
                    }}
                />
            )}

            {/* 2. SongScreen: Taller 96px Gradient Fade so lyrics softly fade above the 48px OS navigation icons */}
            {topSpaceEnabled && isSongScreen && (
                <div
                    style={{
                        position: 'fixed',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: '96px',
                        background: `linear-gradient(to top, ${songSheetBg} 35%, transparent 100%)`,
                        pointerEvents: 'none',
                        zIndex: 90,
                    }}
                />
            )}
        </div>
    );
}

export default function App() {
    return (
        <AppProvider>
            <MainNavigator />
        </AppProvider>
    );
}
