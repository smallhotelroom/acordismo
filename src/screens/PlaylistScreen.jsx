/**
 * @file src/screens/PlaylistScreen.jsx
 * @version 2.4.0
 */
import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, MoreVertical, Search } from 'lucide-react';
import VirtualList from '../components/VirtualList';
import SongItem from '../components/SongItem';
import executeQuery from '../shared/database';

export const __version__ = '2.4.0';

export default function PlaylistScreen({ routeParams, onNavigate, onBack }) {
    const { selectedPlaylistId } = routeParams;

    const [playlistModalVisible, setPlaylistModalVisible] = useState(false);
    const [playlistName, setPlaylistName] = useState('');
    const [playlistSongs, setPlaylistSongs] = useState([]);

    const [playlistSearchVisible, setPlaylistSearchVisible] = useState(false);
    const [playlistOrderStr, setPlaylistOrderStr] = useState('');
    const [playlistSearchStr, setPlaylistSearchStr] = useState('');

    useEffect(() => {
        executeQuery('SELECT name FROM playlists WHERE id = ?;', [selectedPlaylistId])
            .then((data) => {
                if (data.rows.length > 0) {
                    setPlaylistName(data.rows.item(0).name); // index 0 means we count on unique id
                }
            })
            .catch((err) => console.error(err));

        const hasSearch = playlistSearchStr !== '';
        const searchClause = hasSearch ? ' AND (songs.name LIKE ?)' : '';
        const params = hasSearch
            ? [selectedPlaylistId, `%${playlistSearchStr}%`]
            : [selectedPlaylistId];

        const queryStr =
            'SELECT songs.id, songs.name, bands.name AS band_name FROM songs INNER JOIN bands ON songs.band_id = bands.id WHERE songs.id IN (SELECT song_id FROM playlists_songs WHERE playlist_id = ?)';
        executeQuery(queryStr + searchClause + playlistOrderStr + ';', params)
            .then((data) => {
                setPlaylistSongs(data.rows._array);
            })
            .catch((err) => console.error(err));
    }, [selectedPlaylistId, playlistOrderStr, playlistSearchStr]);

    return (
        <>
            <header className="app-header">
                <div className="header-left">
                    <button className="icon-btn" onClick={onBack}>
                        <ArrowLeft size={22} />
                    </button>
                    <h1 className="header-title">{playlistName}</h1>
                </div>
                <div className="header-actions">
                    <button
                        className="icon-btn"
                        onClick={() => setPlaylistSearchVisible(!playlistSearchVisible)}>
                        <Search size={22} />
                    </button>
                    <button className="icon-btn" onClick={() => setPlaylistModalVisible(true)}>
                        <MoreVertical size={22} />
                    </button>
                </div>
            </header>

            {playlistSearchVisible && (
                <div className="search-bar">
                    <input
                        className="search-input"
                        autoFocus
                        placeholder="Search in playlist..."
                        value={playlistSearchStr}
                        onChange={(e) => setPlaylistSearchStr(e.target.value)}
                    />
                    <button className="icon-btn" onClick={() => setPlaylistSearchStr('')}>
                        x
                    </button>
                </div>
            )}

            <VirtualList
                items={playlistSongs}
                itemHeight={68}
                renderItem={(item) => (
                    <SongItem
                        id={item.id}
                        name={item.name}
                        band_name={item.band_name}
                        ft_band_name=""
                        onNavigate={onNavigate}
                        originStr={playlistName}
                    />
                )}
            />

            {playlistModalVisible && (
                <div className="modal-backdrop" onClick={() => setPlaylistModalVisible(false)}>
                    <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                        <p style={{ marginTop: 0 }}>Order:</p>
                        <button
                            className="modal-sort-option"
                            onClick={() => {
                                setPlaylistOrderStr('');
                                setPlaylistModalVisible(false);
                            }}>
                            Original
                        </button>
                        <button
                            className="modal-sort-option"
                            onClick={() => {
                                setPlaylistOrderStr(' ORDER BY bands.name');
                                setPlaylistModalVisible(false);
                            }}>
                            Band Ascending: A <ArrowRight size={14} /> Z
                        </button>
                        <button
                            className="modal-sort-option"
                            onClick={() => {
                                setPlaylistOrderStr(' ORDER BY bands.name DESC');
                                setPlaylistModalVisible(false);
                            }}>
                            Band Descending: Z <ArrowRight size={14} /> A
                        </button>
                        <button
                            className="modal-sort-option"
                            onClick={() => {
                                setPlaylistOrderStr(' ORDER BY songs.name');
                                setPlaylistModalVisible(false);
                            }}>
                            Song Ascending: A <ArrowRight size={14} /> Z
                        </button>
                        <button
                            className="modal-sort-option"
                            onClick={() => {
                                setPlaylistOrderStr(' ORDER BY songs.name DESC');
                                setPlaylistModalVisible(false);
                            }}>
                            Song Descending: Z <ArrowRight size={14} /> A
                        </button>
                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 22 }}>
                            <button
                                className="btn-primary"
                                onClick={() => setPlaylistModalVisible(false)}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
