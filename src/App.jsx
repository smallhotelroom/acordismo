/**
 * @file src/App.jsx
 * @version 2.9.0
 */
import React, { useContext, useEffect, useRef, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { AppContext, AppProvider } from './shared/AppContext';
import HomeScreen from './screens/HomeScreen';
import BandScreen from './screens/BandScreen';
import PlaylistScreen from './screens/PlaylistScreen';
import SongScreen from './screens/SongScreen';
import SettingsScreen from './screens/SettingsScreen';

export const __version__ = '2.9.0';

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

    // RGB tuple matching --bg-primary (#f3f4f6 in light mode, #121212 in dark mode)
    // Multi-stop translucent curve mimics Gemini & Telegram's long bottom mist
    const rgb = darkMode ? '18, 18, 18' : '243, 244, 246';
    const longBottomGradient = `linear-gradient(to top, rgba(${rgb}, 0.90) 0%, rgba(${rgb}, 0.76) 28%, rgba(${rgb}, 0.42) 62%, rgba(${rgb}, 0.12) 85%, rgba(${rgb}, 0) 100%)`;

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

            {/* 2. SongScreen: Long 150px Gemini/Telegram-style multi-stop translucent gradient from fullscreen bottom */}
            {topSpaceEnabled && isSongScreen && (
                <div
                    style={{
                        position: 'fixed',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: '150px',
                        background: longBottomGradient,
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
