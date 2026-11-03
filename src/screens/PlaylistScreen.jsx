/**
 * @file src/screens/PlaylistScreen.jsx
 * @version 2.5.0
 */
import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, MoreVertical, Search } from 'lucide-react';
import VirtualList from '../components/VirtualList';
import SongItem from '../components/SongItem';
import SearchBar from '../components/SearchBar';
import executeQuery from '../shared/database';
import { buildMultiTokenSearchClause } from '../shared/dbMerger';

export const __version__ = '2.5.0';

export default function PlaylistScreen({ routeParams, onNavigate, onBack }) {
    const { selectedPlaylistId } = routeParams;

    const [playlistModalVisible, setPlaylistModalVisible] = useState(false);
    const [playlistName, setPlaylistName] = useState('');
    const [playlistSongs, setPlaylistSongs] = useState([]);

    const [playlistSearchVisible, setPlaylistSearchVisible] = useState(false);
    const [playlistOrderStr, setPlaylistOrderStr] = useState('');
    const [playlistSearchStr, setPlaylistSearchStr] = useState('');
    const [searchInLyrics, setSearchInLyrics] = useState(false);

    useEffect(() => {
        executeQuery('SELECT name FROM playlists WHERE id = ?;', [selectedPlaylistId])
            .then((data) => {
                if (data.rows.length > 0) {
                    setPlaylistName(data.rows.item(0).name); // index 0 means we count on unique id
                }
            })
            .catch((err) => console.error(err));

        const { sqlCondition, params: searchParams } = buildMultiTokenSearchClause(
            playlistSearchStr,
            "COALESCE(songs.search_norm, LOWER(bands.name || ' ' || songs.name))",
            searchInLyrics
        );
        const searchClause = sqlCondition ? ` AND (${sqlCondition})` : '';
        const params = [selectedPlaylistId, ...searchParams];

        const queryStr =
            'SELECT songs.id, songs.name, bands.name AS band_name FROM songs INNER JOIN bands ON songs.band_id = bands.id WHERE songs.id IN (SELECT song_id FROM playlists_songs WHERE playlist_id = ?)';
        executeQuery(queryStr + searchClause + playlistOrderStr + ';', params)
            .then((data) => {
                setPlaylistSongs(data.rows._array);
            })
            .catch((err) => console.error(err));
    }, [selectedPlaylistId, playlistOrderStr, playlistSearchStr, searchInLyrics]);

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
                <SearchBar
                    placeholder={
                        searchInLyrics
                            ? 'Search playlist or lyrics...'
                            : 'Search in playlist (e.g. caetano leaozinho)...'
                    }
                    value={playlistSearchStr}
                    onChange={setPlaylistSearchStr}
                    onClear={() => setPlaylistSearchStr('')}
                    showLyricsToggle={true}
                    searchInLyrics={searchInLyrics}
                    onToggleLyrics={() => setSearchInLyrics((prev) => !prev)}
                />
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
