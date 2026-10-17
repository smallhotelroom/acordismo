/**
 * @file src/shared/AppContext.jsx
 * @version 2.1.0
 */
import React, { createContext, useState } from 'react';

export const __version__ = '2.1.0';

export const AppContext = createContext(null);

export function AppProvider({ children }) {
    const [transposition, setTransposition] = useState(0);
    const [homeSearchVisible, setHomeSearchVisible] = useState(false);
    const [homeSearchStr, setHomeSearchStr] = useState('');
    const [homeModalVisible, setHomeModalVisible] = useState(false);
    const [activeDbLabel, setActiveDbLabel] = useState('Default (Small Hotel Room)');
    const [dbRevision, setDbRevision] = useState(0);

    return (
        <AppContext.Provider
            value={{
                transposition,
                setTransposition,
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
