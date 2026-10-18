/**
 * @file src/shared/AppContext.jsx
 * @version 2.3.0
 */
import React, { createContext, useEffect, useState } from 'react';
import { getSavedDbLabel } from './database';

export const __version__ = '2.3.0';

export const AppContext = createContext(null);

export function AppProvider({ children }) {
    const [transposition, setTransposition] = useState(0);
    const [darkMode, setDarkMode] = useState(() => {
        return localStorage.getItem('acordismo_dark_mode') === 'true';
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

    useEffect(() => {
        localStorage.setItem('acordismo_dark_mode', String(darkMode));
        document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    }, [darkMode]);

    return (
        <AppContext.Provider
            value={{
                transposition,
                setTransposition,
                darkMode,
                setDarkMode,
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
