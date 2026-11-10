/**
 * @file src/screens/HomeScreen.jsx
 * @version 3.8.0
 */
import React, { useContext, useEffect, useState } from 'react';
import { ArrowDownAZ, ArrowUpAZ, ListOrdered, Search, Settings, X } from 'lucide-react';
import executeQuery from '../shared/database';
import { buildMultiTokenSearchClause } from '../shared/dbMerger';
import { AppContext } from '../shared/AppContext';
import MetronomeModal from '../components/MetronomeModal';
import {
    getMetronomeState,
    subscribeMetronomeState,
} from '../shared/audioEngine';

export const __version__ = '3.8.0';

export function MetronomeIcon({ size = 20 }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round">
            <polygon points="6 21 10 3 14 3 18 21 6 21" />
            <line x1="12" y1="15" x2="19" y2="6" />
            <circle cx="16.5" cy="9" r="1.5" fill="currentColor" />
        </svg>
    );
}

export default function HomeScreen({ onNavigate }) {
    const {
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
        hideCrawlerTabsEnabled = true,
        dbRevision,
    } = useContext(AppContext);

    const [items, setItems] = useState([]);
    const [metroState, setMetroState] = useState(() => getMetronomeState());

    useEffect(() => {
        return subscribeMetronomeState((st) => setMetroState(st));
    }, []);

    const currentOrder = tabOrders[currentTab] || 'ASC';

    const handleToggleSort = () => {
        if (currentTab === 'Playlists') {
            const nextOrder =
                currentOrder === 'Original'
                    ? 'ASC'
                    : currentOrder === 'ASC'
                      ? 'DESC'
                      : 'Original';
            setTabOrders({ ...tabOrders, Playlists: nextOrder });
        } else {
            const nextOrder = currentOrder === 'ASC' ? 'DESC' : 'ASC';
            setTabOrders({ ...tabOrders, [currentTab]: nextOrder });
        }
    };

    useEffect(() => {
        let isMounted = true;

        async function loadTabItems() {
            try {
                let sql = '';
                let params = [];

                if (currentTab === 'Playlists') {
                    const { sqlCondition, params: searchParams } =
                        buildMultiTokenSearchClause(homeSearchStr, 'playlists.search_norm', false);
                    const whereClause = sqlCondition ? `WHERE ${sqlCondition}` : '';
                    params = searchParams;

                    const orderClause =
                        currentOrder === 'Original'
                            ? 'ORDER BY playlists.id ASC'
                            : `ORDER BY LOWER(playlists.name) ${currentOrder}`;

                    sql = `SELECT playlists.id, playlists.name FROM playlists ${whereClause} ${orderClause};`;
                } else if (currentTab === 'Bands') {
                    const { sqlCondition, params: searchParams } =
                        buildMultiTokenSearchClause(homeSearchStr, 'bands.search_norm', false);
                    const conditions = [];
                    if (hideCrawlerTabsEnabled) {
                        conditions.push('COALESCE(bands.has_chords, 1) = 1');
                    }
                    if (sqlCondition) {
                        conditions.push(sqlCondition);
                    }
                    const whereClause =
                        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
                    params = searchParams;

                    sql = `SELECT bands.id, bands.name FROM bands ${whereClause} ORDER BY LOWER(bands.name) ${currentOrder};`;
                } else {
                    const { sqlCondition, params: searchParams } =
                        buildMultiTokenSearchClause(homeSearchStr, 'songs.search_norm', true);
                    const conditions = [];
                    if (hideCrawlerTabsEnabled) {
                        conditions.push('COALESCE(songs.has_chords, 1) = 1');
                    }
                    if (sqlCondition) {
                        conditions.push(sqlCondition);
                    }
                    const whereClause =
                        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
                    params = searchParams;

                    sql = `
                        SELECT songs.id, songs.name, songs.origin_id, bands.name AS band_name
                        FROM songs
                        INNER JOIN bands ON songs.band_id = bands.id
                        ${whereClause}
                        ORDER BY LOWER(songs.name) ${currentOrder}, LOWER(bands.name) ${currentOrder};
                    `;
                }

                const res = await executeQuery(sql, params);
                if (isMounted) {
                    setItems(res.rows._array);
                }
            } catch (err) {
                console.error(err);
            }
        }

        loadTabItems();
        return () => {
            isMounted = false;
        };
    }, [currentTab, currentOrder, homeSearchStr, hideCrawlerTabsEnabled, dbRevision]);

    return (
        <>
            <header className="app-header">
                <div className="header-left">
                    <h1 className="header-title">Acordismo</h1>
                </div>
                <div className="header-actions">
                    <button
                        className="icon-btn"
                        title="Toggle Sort Order"
                        onClick={handleToggleSort}>
                        {currentOrder === 'Original' ? (
                            <ListOrdered size={20} />
                        ) : currentOrder === 'ASC' ? (
                            <ArrowDownAZ size={20} />
                        ) : (
                            <ArrowUpAZ size={20} />
                        )}
                    </button>

                    <button
                        className="icon-btn"
                        title="Metronome & Reference Notes"
                        onClick={() => setHomeModalVisible(true)}
                        style={
                            metroState.isPlaying
                                ? {
                                      color: '#f59e0b',
                                      background: 'rgba(245, 158, 11, 0.14)',
                                      borderRadius: 8,
                                  }
                                : undefined
                        }>
                        <MetronomeIcon size={20} />
                    </button>

                    <button
                        className="icon-btn"
                        title="Search"
                        onClick={() => {
                            if (homeSearchVisible) {
                                setHomeSearchStr('');
                                setHomeSearchVisible(false);
                            } else {
                                setHomeSearchVisible(true);
                            }
                        }}>
                        <Search size={20} />
                    </button>

                    <button
                        className="icon-btn"
                        title="Settings"
                        onClick={() => onNavigate({ screen: 'Settings' })}>
                        <Settings size={20} />
                    </button>
                </div>
            </header>

            {homeSearchVisible && (
                <div className="search-bar-container">
                    <input
                        type="text"
                        className="search-input"
                        placeholder={`Search ${currentTab.toLowerCase()}...`}
                        value={homeSearchStr}
                        autoFocus
                        onChange={(e) => setHomeSearchStr(e.target.value)}
                    />
                    {homeSearchStr && (
                        <button
                            className="icon-btn"
                            title="Clear search"
                            onClick={() => setHomeSearchStr('')}>
                            <X size={18} />
                        </button>
                    )}
                </div>
            )}

            <main className="content-scroll">
                {items.map((item) => {
                    if (currentTab === 'Playlists') {
                        return (
                            <div
                                key={item.id}
                                className="list-item"
                                onClick={() =>
                                    onNavigate({
                                        screen: 'Playlist',
                                        params: { selectedPlaylistId: item.id },
                                    })
                                }>
                                {item.name}
                            </div>
                        );
                    }
                    if (currentTab === 'Bands') {
                        return (
                            <div
                                key={item.id}
                                className="list-item"
                                onClick={() =>
                                    onNavigate({
                                        screen: 'Band',
                                        params: { selectedBandId: item.id },
                                    })
                                }>
                                {item.name}
                            </div>
                        );
                    }
                    return (
                        <div
                            key={item.id}
                            className="list-item"
                            onClick={() =>
                                onNavigate({
                                    screen: 'Song',
                                    params: {
                                        selectedSongId: item.id,
                                        originStr: item.band_name,
                                    },
                                })
                            }>
                            {item.name} — <span style={{ opacity: 0.75 }}>{item.band_name}</span>
                        </div>
                    );
                })}
            </main>

            <nav className="bottom-tabs">
                {['Playlists', 'Bands', 'Songs'].map((tabName) => (
                    <button
                        key={tabName}
                        className={`tab-btn ${currentTab === tabName ? 'active' : ''}`}
                        onClick={() => setCurrentTab(tabName)}>
                        {tabName}
                    </button>
                ))}
            </nav>

            <MetronomeModal
                visible={homeModalVisible}
                metroState={metroState}
                onClose={() => setHomeModalVisible(false)}
            />
        </>
    );
}
