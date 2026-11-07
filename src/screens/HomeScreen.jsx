/**
 * @file src/screens/HomeScreen.jsx
 * @version 2.10.0
 */
import React, { useContext, useEffect, useState } from 'react';
import { ArrowRight, Menu, MoreVertical, Moon, Search, Sun } from 'lucide-react';
import VirtualList from '../components/VirtualList';
import SongItem from '../components/SongItem';
import SearchBar from '../components/SearchBar';
import executeQuery from '../shared/database';
import { buildMultiTokenSearchClause } from '../shared/dbMerger';
import { AppContext } from '../shared/AppContext';
import { getMetronomeState, subscribeMetronomeState } from '../shared/audioEngine';

export const __version__ = '2.10.0';

/**
 * Clean 20x20 stroke SVG icon for the Metronome (matches Lucide 2px stroke aesthetic).
 */
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
            <path d="M6 21L10 3h4l4 18H6z" />
            <path d="M12 18L19 7" />
            <line x1="8" y1="15" x2="16" y2="15" />
        </svg>
    );
}

/**
 * Clean 20x20 stroke SVG icon for the Tuning Fork / Tuner (matches Lucide 2px stroke aesthetic).
 */
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
            <path d="M8 3v7a4 4 0 0 0 8 0V3" />
            <line x1="12" y1="14" x2="12" y2="21" />
        </svg>
    );
}

export default function HomeScreen({ onNavigate }) {
    const {
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
        hideCrawlerTabsEnabled,
        dbRevision,
    } = useContext(AppContext);

    const [playlists, setPlaylists] = useState([]);
    const [bands, setBands] = useState([]);
    const [songs, setSongs] = useState([]);
    const [searchInLyrics, setSearchInLyrics] = useState(false);
    const [metroActive, setMetroActive] = useState(() => getMetronomeState().isPlaying);

    useEffect(() => {
        return subscribeMetronomeState((st) => setMetroActive(st.isPlaying));
    }, []);

    const currentOrder = tabOrders[currentTab];

    useEffect(() => {
        if (currentTab === 'Playlists') {
            const { sqlCondition, params } = buildMultiTokenSearchClause(
                homeSearchStr,
                'playlists.search_norm',
                false
            );
            const whereClause = sqlCondition ? ` WHERE ${sqlCondition}` : '';
            const orderClause =
                currentOrder === 'ASC'
                    ? ' ORDER BY name ASC'
                    : currentOrder === 'DESC'
                      ? ' ORDER BY name DESC'
                      : '';

            executeQuery(`SELECT id, name FROM playlists${whereClause}${orderClause};`, params)
                .then((data) => {
                    setPlaylists(data.rows._array);
                })
                .catch((err) => console.error(err));
        } else if (currentTab === 'Bands') {
            const { sqlCondition, params } = buildMultiTokenSearchClause(
                homeSearchStr,
                'bands.search_norm',
                false
            );
            const conditions = [];
            if (hideCrawlerTabsEnabled) {
                conditions.push('bands.has_chords = 1');
            }
            if (sqlCondition) {
                conditions.push(`(${sqlCondition})`);
            }
            const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
            const orderClause =
                currentOrder === 'ASC'
                    ? ' ORDER BY name ASC'
                    : currentOrder === 'DESC'
                      ? ' ORDER BY name DESC'
                      : '';

            executeQuery(`SELECT id, name FROM bands${whereClause}${orderClause};`, params)
                .then((data) => {
                    setBands(data.rows._array);
                })
                .catch((err) => console.error(err));
        } else if (currentTab === 'Songs') {
            const { sqlCondition, params } = buildMultiTokenSearchClause(
                homeSearchStr,
                'songs.search_norm',
                searchInLyrics
            );
            const conditions = [];
            if (hideCrawlerTabsEnabled) {
                conditions.push('songs.has_chords = 1');
            }
            if (sqlCondition) {
                conditions.push(`(${sqlCondition})`);
            }
            const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
            const orderClause =
                currentOrder === 'ASC'
                    ? ' ORDER BY songs.name ASC'
                    : currentOrder === 'DESC'
                      ? ' ORDER BY songs.name DESC'
                      : '';

            executeQuery(
                `SELECT songs.id, songs.name, bands.name AS band_name FROM songs INNER JOIN bands ON songs.band_id = bands.id${whereClause}${orderClause};`,
                params
            )
                .then((data) => {
                    setSongs(data.rows._array);
                })
                .catch((err) => console.error(err));
        }
    }, [currentTab, currentOrder, homeSearchStr, searchInLyrics, hideCrawlerTabsEnabled, dbRevision]);

    const handleTabSelect = (tabName) => {
        setCurrentTab(tabName);
        setHomeSearchVisible(false);
        setHomeSearchStr('');
    };

    const setOrderForCurrentTab = (orderVal) => {
        setTabOrders((prev) => ({ ...prev, [currentTab]: orderVal }));
        setHomeModalVisible(false);
    };

    return (
        <>
            <header className="app-header">
                <div className="header-left">
                    <button
                        className="icon-btn"
                        title="Settings"
                        onClick={() => onNavigate({ screen: 'Settings' })}>
                        <Menu size={24} />
                    </button>
                    <h1 className="header-title">Acordismo</h1>
                </div>
                <div className="header-actions">
                    <button
                        className="icon-btn"
                        title={metroActive ? 'Metronome (Playing)' : 'Metronome'}
                        style={
                            metroActive
                                ? {
                                      color: '#f59e0b',
                                      background: 'rgba(245, 158, 11, 0.15)',
                                      borderRadius: 8,
                                  }
                                : undefined
                        }
                        onClick={() => onNavigate({ screen: 'Metronome' })}>
                        <MetronomeIcon size={20} />
                    </button>
                    <button
                        className="icon-btn"
                        title="Tuner"
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
                        onClick={() => setHomeSearchVisible(!homeSearchVisible)}>
                        <Search size={22} />
                    </button>
                    <button
                        className="icon-btn"
                        title="Order"
                        onClick={() => setHomeModalVisible(true)}>
                        <MoreVertical size={22} />
                    </button>
                </div>
            </header>

            {homeSearchVisible && (
                <SearchBar
                    placeholder={
                        currentTab === 'Songs'
                            ? searchInLyrics
                                ? 'Search band, song, or lyrics...'
                                : 'Search band or song (e.g. small hotel moon)...'
                            : `Search ${currentTab.toLowerCase()}...`
                    }
                    value={homeSearchStr}
                    onChange={setHomeSearchStr}
                    onClear={() => setHomeSearchStr('')}
                    showLyricsToggle={currentTab === 'Songs'}
                    searchInLyrics={searchInLyrics}
                    onToggleLyrics={() => setSearchInLyrics((prev) => !prev)}
                />
            )}

            <nav className="tabs-bar">
                {['Playlists', 'Bands', 'Songs'].map((tab) => (
                    <button
                        key={tab}
                        className={`tab-btn ${currentTab === tab ? 'active' : ''}`}
                        onClick={() => handleTabSelect(tab)}>
                        {tab}
                    </button>
                ))}
            </nav>

            {currentTab === 'Playlists' && (
                <VirtualList
                    items={playlists}
                    itemHeight={54}
                    renderItem={(item) => (
                        <div
                            className="list-item"
                            style={{ height: '100%', display: 'flex', alignItems: 'center' }}
                            onClick={() =>
                                onNavigate({
                                    screen: 'Playlist',
                                    params: { selectedPlaylistId: item.id },
                                })
                            }>
                            <div className="list-item-title">{item.name}</div>
                        </div>
                    )}
                />
            )}

            {currentTab === 'Bands' && (
                <VirtualList
                    items={bands}
                    itemHeight={54}
                    renderItem={(item) => (
                        <div
                            className="list-item"
                            style={{ height: '100%', display: 'flex', alignItems: 'center' }}
                            onClick={() =>
                                onNavigate({
                                    screen: 'Band',
                                    params: { selectedBandId: item.id },
                                })
                            }>
                            <div className="list-item-title">{item.name}</div>
                        </div>
                    )}
                />
            )}

            {currentTab === 'Songs' && (
                <VirtualList
                    items={songs}
                    itemHeight={68}
                    renderItem={(item) => (
                        <SongItem
                            id={item.id}
                            name={item.name}
                            band_name={item.band_name}
                            ft_band_name=""
                            onNavigate={onNavigate}
                            originStr={item.band_name}
                        />
                    )}
                />
            )}

            {homeModalVisible && (
                <div className="modal-backdrop" onClick={() => setHomeModalVisible(false)}>
                    <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                        <p style={{ marginTop: 0 }}>Order:</p>
                        {currentTab === 'Playlists' && (
                            <button
                                className="modal-sort-option"
                                onClick={() => setOrderForCurrentTab('Original')}>
                                {currentTab} Original
                            </button>
                        )}
                        <button
                            className="modal-sort-option"
                            onClick={() => setOrderForCurrentTab('ASC')}>
                            {currentTab} Ascending: A <ArrowRight size={14} /> Z
                        </button>
                        <button
                            className="modal-sort-option"
                            onClick={() => setOrderForCurrentTab('DESC')}>
                            {currentTab} Descending: Z <ArrowRight size={14} /> A
                        </button>
                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 22 }}>
                            <button
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
