/**
 * @file src/screens/BandScreen.jsx
 * @version 2.7.0
 */
import React, { useContext, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, MoreVertical, Search } from 'lucide-react';
import SongItem from '../components/SongItem';
import SearchBar from '../components/SearchBar';
import executeQuery from '../shared/database';
import { buildMultiTokenSearchClause } from '../shared/dbMerger';
import { AppContext } from '../shared/AppContext';

export const __version__ = '2.7.0';

export default function BandScreen({ routeParams, onNavigate, onBack }) {
    const { selectedBandId } = routeParams;
    const { hideCrawlerTabsEnabled } = useContext(AppContext);

    const [bandModalVisible, setBandModalVisible] = useState(false);
    const [bandName, setBandName] = useState('');
    const [bandSongs, setBandSongs] = useState([]);
    const [bandFeaturing, setBandFeaturing] = useState([]);

    const [bandSearchVisible, setBandSearchVisible] = useState(false);
    const [bandOrderStr, setBandOrderStr] = useState('');
    const [bandSearchStr, setBandSearchStr] = useState('');
    const [searchInLyrics, setSearchInLyrics] = useState(false);

    useEffect(() => {
        executeQuery('SELECT name FROM bands WHERE id = ?;', [selectedBandId])
            .then((data) => {
                if (data.rows.length > 0) {
                    setBandName(data.rows.item(0).name); // index 0 means we count on unique id
                }
            })
            .catch((err) => console.error(err));

        const { sqlCondition, params: searchParams } = buildMultiTokenSearchClause(
            bandSearchStr,
            'songs.search_norm',
            searchInLyrics
        );
        const hasChordsClause = hideCrawlerTabsEnabled ? ' AND songs.has_chords = 1' : '';
        const searchClause = sqlCondition ? ` AND (${sqlCondition})` : '';
        const queryParams = [selectedBandId, ...searchParams];

        const queryStr = 'SELECT id, name FROM songs WHERE band_id = ?';
        executeQuery(queryStr + hasChordsClause + searchClause + bandOrderStr + ';', queryParams)
            .then((data) => {
                setBandSongs(data.rows._array);
            })
            .catch((err) => console.error(err));

        const queryFtStr =
            'SELECT songs.id, songs.name, bands.name AS ft_band_name FROM songs_ft_bands INNER JOIN songs ON songs_ft_bands.song_id = songs.id INNER JOIN bands ON songs.band_id = bands.id WHERE songs_ft_bands.ft_band_id = ?';
        executeQuery(queryFtStr + hasChordsClause + searchClause + bandOrderStr + ';', queryParams)
            .then((data) => {
                setBandFeaturing(data.rows._array);
            })
            .catch((err) => console.error(err));
    }, [selectedBandId, bandOrderStr, bandSearchStr, searchInLyrics, hideCrawlerTabsEnabled]);

    return (
        <>
            <header className="app-header">
                <div className="header-left">
                    <button className="icon-btn" onClick={onBack}>
                        <ArrowLeft size={22} />
                    </button>
                    <h1 className="header-title">{bandName}</h1>
                </div>
                <div className="header-actions">
                    <button
                        className="icon-btn"
                        onClick={() => setBandSearchVisible(!bandSearchVisible)}>
                        <Search size={22} />
                    </button>
                    <button className="icon-btn" onClick={() => setBandModalVisible(true)}>
                        <MoreVertical size={22} />
                    </button>
                </div>
            </header>

            {bandSearchVisible && (
                <SearchBar
                    placeholder={
                        searchInLyrics ? 'Search in band or lyrics...' : 'Search in band...'
                    }
                    value={bandSearchStr}
                    onChange={setBandSearchStr}
                    onClear={() => setBandSearchStr('')}
                    showLyricsToggle={true}
                    searchInLyrics={searchInLyrics}
                    onToggleLyrics={() => setSearchInLyrics((prev) => !prev)}
                />
            )}

            <main className="content-scroll">
                {bandSongs.map((item) => (
                    <SongItem
                        key={`song-${item.id}`}
                        id={item.id}
                        name={item.name}
                        band_name=""
                        ft_band_name=""
                        onNavigate={onNavigate}
                        originStr={bandName}
                    />
                ))}

                {bandFeaturing.length > 0 && (
                    <>
                        <div className="section-header">Also featured in:</div>
                        {bandFeaturing.map((item) => (
                            <SongItem
                                key={`ft-${item.id}`}
                                id={item.id}
                                name={item.name}
                                band_name={bandName}
                                ft_band_name={item.ft_band_name}
                                onNavigate={onNavigate}
                                originStr={bandName}
                            />
                        ))}
                    </>
                )}
            </main>

            {bandModalVisible && (
                <div className="modal-backdrop" onClick={() => setBandModalVisible(false)}>
                    <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                        <p style={{ marginTop: 0 }}>Order:</p>
                        <button
                            className="modal-sort-option"
                            onClick={() => {
                                setBandOrderStr(' ORDER BY songs.name');
                                setBandModalVisible(false);
                            }}>
                            Ascending: A <ArrowRight size={14} /> Z
                        </button>
                        <button
                            className="modal-sort-option"
                            onClick={() => {
                                setBandOrderStr(' ORDER BY songs.name DESC');
                                setBandModalVisible(false);
                            }}>
                            Descending: Z <ArrowRight size={14} /> A
                        </button>
                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 22 }}>
                            <button
                                className="btn-primary"
                                onClick={() => setBandModalVisible(false)}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
