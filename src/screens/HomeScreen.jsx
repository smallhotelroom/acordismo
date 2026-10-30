/**
 * @file src/screens/HomeScreen.jsx
 * @version 2.4.0
 */
import React, { useContext, useEffect, useState } from 'react';
import { ArrowRight, MoreVertical, Moon, Search, Settings, Sun } from 'lucide-react';
import VirtualList from '../components/VirtualList';
import SongItem from '../components/SongItem';
import executeQuery from '../shared/database';
import { AppContext } from '../shared/AppContext';

export const __version__ = '2.4.0';

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
        dbRevision,
    } = useContext(AppContext);

    const [playlists, setPlaylists] = useState([]);
    const [bands, setBands] = useState([]);
    const [songs, setSongs] = useState([]);

    const currentOrder = tabOrders[currentTab];

    useEffect(() => {
        const searchLike = `%${homeSearchStr}%`;

        if (currentTab === 'Playlists') {
            const whereClause = homeSearchStr === '' ? '' : ' WHERE playlists.name LIKE ?';
            const orderClause =
                currentOrder === 'ASC'
                    ? ' ORDER BY name ASC'
                    : currentOrder === 'DESC'
                      ? ' ORDER BY name DESC'
                      : '';
            const params = homeSearchStr === '' ? [] : [searchLike];

            executeQuery(`SELECT * FROM playlists${whereClause}${orderClause};`, params)
                .then((data) => {
                    setPlaylists(data.rows._array);
                })
                .catch((err) => console.error(err));
        } else if (currentTab === 'Bands') {
            const whereClause = homeSearchStr === '' ? '' : ' WHERE bands.name LIKE ?';
            const orderClause =
                currentOrder === 'ASC'
                    ? ' ORDER BY name ASC'
                    : currentOrder === 'DESC'
                      ? ' ORDER BY name DESC'
                      : '';
            const params = homeSearchStr === '' ? [] : [searchLike];

            executeQuery(`SELECT * FROM bands${whereClause}${orderClause};`, params)
                .then((data) => {
                    setBands(data.rows._array);
                })
                .catch((err) => console.error(err));
        } else if (currentTab === 'Songs') {
            const whereClause = homeSearchStr === '' ? '' : ' WHERE songs.name LIKE ?';
            const orderClause =
                currentOrder === 'ASC'
                    ? ' ORDER BY songs.name ASC'
                    : currentOrder === 'DESC'
                      ? ' ORDER BY songs.name DESC'
                      : '';
            const params = homeSearchStr === '' ? [] : [searchLike];

            executeQuery(
                `SELECT songs.id, songs.name, bands.name AS band_name FROM songs INNER JOIN bands ON songs.band_id = bands.id${whereClause}${orderClause};`,
                params
            )
                .then((data) => {
                    setSongs(data.rows._array);
                })
                .catch((err) => console.error(err));
        }
    }, [currentTab, currentOrder, homeSearchStr, dbRevision]);

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
                    <h1 className="header-title">Acordismo</h1>
                </div>
                <div className="header-actions">
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
                    <button
                        className="icon-btn"
                        title="Settings"
                        onClick={() => onNavigate({ screen: 'Settings' })}>
                        <Settings size={22} />
                    </button>
                </div>
            </header>

            {homeSearchVisible && (
                <div className="search-bar">
                    <input
                        className="search-input"
                        autoFocus
                        placeholder={`Search ${currentTab.toLowerCase()}...`}
                        value={homeSearchStr}
                        onChange={(e) => setHomeSearchStr(e.target.value)}
                    />
                    <button className="icon-btn" onClick={() => setHomeSearchStr('')}>
                        x
                    </button>
                </div>
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
                            <button className="btn-primary" onClick={() => setHomeModalVisible(false)}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
