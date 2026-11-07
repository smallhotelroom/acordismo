/**
 * @file src/App.jsx
 * @version 2.2.0
 */
import React, { useEffect, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { AppProvider } from './shared/AppContext';
import HomeScreen from './screens/HomeScreen';
import PlaylistScreen from './screens/PlaylistScreen';
import BandScreen from './screens/BandScreen';
import SongScreen from './screens/SongScreen';
import SettingsScreen from './screens/SettingsScreen';
import TunerScreen from './screens/TunerScreen';
import MetronomeScreen from './screens/MetronomeScreen';

export const __version__ = '2.2.0';

export default function App() {
    const [navStack, setNavStack] = useState([{ screen: 'Home', params: {} }]);

    const navigate = ({ screen, params = {} }) => {
        setNavStack((prev) => [...prev, { screen, params }]);
    };

    const goBack = () => {
        setNavStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
    };

    useEffect(() => {
        let listenerHandle = null;
        CapApp.addListener('backButton', () => {
            setNavStack((prev) => {
                if (prev.length > 1) {
                    return prev.slice(0, -1);
                }
                CapApp.exitApp();
                return prev;
            });
        }).then((handle) => {
            listenerHandle = handle;
        });

        return () => {
            if (listenerHandle) {
                listenerHandle.remove();
            }
        };
    }, []);

    const currentRoute = navStack[navStack.length - 1];

    return (
        <AppProvider>
            <div className="app-shell">
                {currentRoute.screen === 'Home' && <HomeScreen onNavigate={navigate} />}
                {currentRoute.screen === 'Playlist' && (
                    <PlaylistScreen
                        routeParams={currentRoute.params}
                        onNavigate={navigate}
                        onBack={goBack}
                    />
                )}
                {currentRoute.screen === 'Band' && (
                    <BandScreen
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
                {currentRoute.screen === 'Tuner' && <TunerScreen onBack={goBack} />}
                {currentRoute.screen === 'Metronome' && <MetronomeScreen onBack={goBack} />}
            </div>
        </AppProvider>
    );
}
