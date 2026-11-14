/**
 * @file src/screens/HomeScreen.jsx
 * @version 3.9.1
 * Canonical SHR HomeScreen layout:
 * 1) Header: Left { Menu (3 bars -> Settings), SHR } | Right { Metronome, Tuner, DarkMode, Search, MoreVertical (3 dots) }
 * 2) Top Tab Bar: PLAYLISTS | BANDS | SONGS directly under the header
 * 3) Infinite scroll list + Contextual 3-dots Sort Order Modal
 */
import React, { useContext, useEffect, useRef, useState } from 'react';
import { Menu, Moon, MoreVertical, Search, Sun, X } from 'lucide-react';
import executeQuery from '../shared/database';
import { buildMultiTokenSearchClause } from '../shared/dbMerger';
import { AppContext } from '../shared/AppContext';
import {
    getMetronomeState,
    subscribeMetronomeState,
} from '../shared/audioEngine';

export const __version__ = '3.9.1';

const PAGE_SIZE = 80;

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

export function TuningForkIcon({ size = 20 }) {
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
            <path d="M7 3v7a5 5 0 0 0 10 0V3" />
            <line x1="12" y1="15" x2="12" y2="21" />
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
        darkMode,
        setDarkMode,
        hideCrawlerTabsEnabled = true,
        dbRevision,
    } = useContext(AppContext);

    const [items, setItems] = useState([]);
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const [metroState, setMetroState] = useState(() => getMetronomeState());
    const scrollRef = useRef(null);

    useEffect(() => {
        return subscribeMetronomeState((st) => setMetroState(st));
    }, []);

    const currentOrder = tabOrders[currentTab] || 'ASC';

    const handleSelectSortOrder = (nextOrder) => {
        setTabOrders({ ...tabOrders, [currentTab]: nextOrder });
        setHomeModalVisible(false);
    };

    useEffect(() => {
        let isMounted = true;
        setVisibleCount(PAGE_SIZE);
        if (scrollRef.current) {
            scrollRef.current.scrollTop = 0;
        }

        async function loadTabItems() {
            try {
                let sql = '';
                let params = [];

                if (currentTab === 'Playlists') {
                    const { sqlCondition, params: searchParams } =
                        buildMultiTokenSearchClause(
                            homeSearchStr,
                            'playlists.search_norm',
                            false
                        );
                    const whereClause = sqlCondition ? `WHERE ${sqlCondition}` : '';
                    params = searchParams;

                    const orderClause =
                        currentOrder === 'Original'
                            ? 'ORDER BY playlists.id ASC'
                            : `ORDER BY LOWER(playlists.name) ${currentOrder}`;

                    sql = `SELECT playlists.id, playlists.name FROM playlists ${whereClause} ${orderClause};`;
                } else if (currentTab === 'Bands') {
                    const { sqlCondition, params: searchParams } =
                        buildMultiTokenSearchClause(
                            homeSearchStr,
                            'bands.search_norm',
                            false
                        );
                    const conditions = [];
                    if (hideCrawlerTabsEnabled) {
                        conditions.push('COALESCE(bands.has_chords, 1) = 1');
                    }
                    if (sqlCondition) {
                        conditions.push(sqlCondition);
                    }
                    const whereClause =
                        conditions.length > 0
                            ? `WHERE ${conditions.join(' AND ')}`
                            : '';
                    params = searchParams;

                    sql = `SELECT bands.id, bands.name FROM bands ${whereClause} ORDER BY LOWER(bands.name) ${currentOrder};`;
                } else {
                    const { sqlCondition, params: searchParams } =
                        buildMultiTokenSearchClause(
                            homeSearchStr,
                            'songs.search_norm',
                            true
                        );
                    const conditions = [];
                    if (hideCrawlerTabsEnabled) {
                        conditions.push('COALESCE(songs.has_chords, 1) = 1');
                    }
                    if (sqlCondition) {
                        conditions.push(sqlCondition);
                    }
                    const whereClause =
                        conditions.length > 0
                            ? `WHERE ${conditions.join(' AND ')}`
                            : '';
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

    const handleScroll = (e) => {
        const el = e.currentTarget;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 240) {
            if (visibleCount < items.length) {
                setVisibleCount((prev) => Math.min(items.length, prev + PAGE_SIZE));
            }
        }
    };

    const visibleItems = items.slice(0, visibleCount);

    const sortOptions =
        currentTab === 'Playlists'
            ? [
                  { id: 'Original', label: 'Original Order' },
                  { id: 'ASC', label: 'A → Z (Ascending)' },
                  { id: 'DESC', label: 'Z → A (Descending)' },
              ]
            : [
                  { id: 'ASC', label: 'A → Z (Ascending)' },
                  { id: 'DESC', label: 'Z → A (Descending)' },
              ];

    return (
        <>
            <header className="app-header">
                <div className="header-left">
                    <button
                        className="icon-btn"
                        title="Settings"
                        onClick={() => onNavigate({ screen: 'Settings' })}>
                        <Menu size={22} />
                    </button>
                    <h1 className="header-title">Small Hotel Room (App)</h1>
                </div>

                <div className="header-actions">
                    <button
                        className="icon-btn"
                        title="SHR Metronome"
                        onClick={() => onNavigate({ screen: 'Metronome' })}
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
                        title="SHR Tuner"
                        onClick={() => onNavigate({ screen: 'Tuner' })}>
                        <TuningForkIcon size={20} />
                    </button>

                    <button
                        className="icon-btn"
                        title="Toggle Dark Mode"
                        onClick={() => setDarkMode(!darkMode)}>
                        {darkMode ? <Sun size={20} /> : <Moon size={20} />}
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
                        title="Sort Options"
                        onClick={() => setHomeModalVisible(true)}>
                        <MoreVertical size={20} />
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

            <nav
                className="tabs-bar"
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    borderBottom: '1px solid var(--border-color)',
                    background: 'var(--bg-surface)',
                    flexShrink: 0,
                }}>
                {['Playlists', 'Bands', 'Songs'].map((tabName) => {
                    const isActive = currentTab === tabName;
                    return (
                        <button
                            key={tabName}
                            type="button"
                            className={`tab-btn ${isActive ? 'active' : ''}`}
                            onClick={() => setCurrentTab(tabName)}
                            style={{
                                padding: '13px 8px',
                                border: 'none',
                                borderBottom: isActive
                                    ? '3px solid var(--accent-color)'
                                    : '3px solid transparent',
                                background: 'transparent',
                                color: isActive
                                    ? 'var(--text-primary)'
                                    : 'var(--text-secondary)',
                                fontWeight: 700,
                                fontSize: '0.88rem',
                                letterSpacing: '0.03em',
                                textTransform: 'uppercase',
                                cursor: 'pointer',
                            }}>
                            {tabName}
                        </button>
                    );
                })}
            </nav>

            <main
                ref={scrollRef}
                className="content-scroll"
                onScroll={handleScroll}>
                {visibleItems.map((item) => {
                    if (currentTab === 'Playlists') {
                        return (
                            <div
                                key={item.id}
                                className="list-item"
                                style={{ fontWeight: 700 }}
                                onClick={() =>
                                    onNavigate({
                                        screen: 'Playlist',
                                        params: {
                                            selectedPlaylistId: item.id,
                                            selectedPlaylistName: item.name,
                                        },
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
                                style={{ fontWeight: 700 }}
                                onClick={() =>
                                    onNavigate({
                                        screen: 'Band',
                                        params: {
                                            selectedBandId: item.id,
                                            selectedBandName: item.name,
                                        },
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
                            <strong>{item.name}</strong>{' '}
                            <span style={{ color: 'var(--text-secondary)' }}>
                                [{item.band_name}]
                            </span>
                        </div>
                    );
                })}
            </main>

            {homeModalVisible && (
                <div
                    className="modal-backdrop"
                    onClick={() => setHomeModalVisible(false)}>
                    <div
                        className="modal-card"
                        onClick={(e) => e.stopPropagation()}>
                        <div
                            style={{
                                fontWeight: 700,
                                marginBottom: 12,
                                paddingBottom: 10,
                                borderBottom: '1px solid var(--border-color)',
                            }}>
                            Sort {currentTab}
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 8,
                                marginBottom: 15,
                            }}>
                            {sortOptions.map((opt) => {
                                const active = currentOrder === opt.id;
                                return (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        className="btn-primary"
                                        style={{
                                            background: active
                                                ? 'var(--accent-color)'
                                                : 'var(--bg-primary)',
                                            color: active
                                                ? '#ffffff'
                                                : 'var(--text-primary)',
                                            border: '1px solid var(--border-color)',
                                            textAlign: 'left',
                                            padding: '10px 14px',
                                        }}
                                        onClick={() => handleSelectSortOrder(opt.id)}>
                                        {opt.label}
                                    </button>
                                );
                            })}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <button
                                type="button"
                                className="btn-primary"
                                onClick={() => setHomeModalVisible(false)}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
