/**
 * @file src/App.jsx
 * @version 2.4.0
 */
import React, { useEffect, useRef, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { AppProvider } from './shared/AppContext';
import HomeScreen from './screens/HomeScreen';
import BandScreen from './screens/BandScreen';
import PlaylistScreen from './screens/PlaylistScreen';
import SongScreen from './screens/SongScreen';
import SettingsScreen from './screens/SettingsScreen';

export const __version__ = '2.4.0';

function MainNavigator() {
    const [history, setHistory] = useState([{ screen: 'Home', params: {} }]);
    const historyRef = useRef(history);

    useEffect(() => {
        historyRef.current = history;
    }, [history]);

    const currentRoute = history[history.length - 1];

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

    return (
        <div className="app-shell">
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
