/**
 * @file src/App.jsx
 * @version 2.1.1
 */
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { transpose } from 'chord-transposer';
import { ArrowLeft, ArrowRight, MoreVertical, Search, Settings, Upload, RotateCcw } from 'lucide-react';
import executeQuery, { loadExternalDatabaseFile, resetToDefaultDatabase } from './shared/database';
import { AppContext, AppProvider } from './shared/AppContext';

export const __version__ = '2.1.1';

function transposeChordToken(token, transposition) {
    if (!token || transposition === 0) {
        return token;
    }
    try {
        if (transposition > 0) {
            return transpose(token).up(transposition).toString();
        }
        return transpose(token).down(-transposition).toString();
    } catch (err) {
        console.error(err);
        return token;
    }
}

/* -------------------------------------------------------------------------- */
/*                                 SONG ITEM                                  */
/* -------------------------------------------------------------------------- */
function SongItem({ id, name, band_name, ft_band_name, onNavigate, originStr }) {
    return (
        <div
            className="list-item"
            onClick={() =>
                onNavigate({
                    screen: 'Song',
                    params: { selectedSongId: id, originStr },
                })
            }>
            <div className="list-item-title">{name}</div>
            {band_name === '' ? null : ft_band_name === '' ? (
                <div className="list-item-subtitle">{band_name}</div>
            ) : (
                <div className="list-item-subtitle">
                    {ft_band_name}; {band_name}
                </div>
            )}
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/*                                 HOME SCREEN                                */
/* -------------------------------------------------------------------------- */
function HomeScreen({ onNavigate }) {
    const {
        homeSearchVisible,
        setHomeSearchVisible,
        homeSearchStr,
        setHomeSearchStr,
        homeModalVisible,
        setHomeModalVisible,
        dbRevision,
    } = useContext(AppContext);

    const [currentTab, setCurrentTab] = useState('Playlists');
    const [tabOrders, setTabOrders] = useState({
        Playlists: 'Original',
        Bands: 'ASC',
        Songs: 'ASC',
    });

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
                    const tmp = [];
                    for (let i = 0; i < data.rows.length; i++) {
                        tmp.push(data.rows.item(i));
                    }
                    setPlaylists(tmp);
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
                    const tmp = [];
                    for (let i = 0; i < data.rows.length; i++) {
                        tmp.push(data.rows.item(i));
                    }
                    setBands(tmp);
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
                    const tmp = [];
                    for (let i = 0; i < data.rows.length; i++) {
                        tmp.push(data.rows.item(i));
                    }
                    setSongs(tmp);
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

            <main className="content-scroll">
                {currentTab === 'Playlists' &&
                    playlists.map((item) => (
                        <div
                            key={item.id}
                            className="list-item"
                            onClick={() =>
                                onNavigate({
                                    screen: 'Playlist',
                                    params: { selectedPlaylistId: item.id },
                                })
                            }>
                            <div className="list-item-title">{item.name}</div>
                        </div>
                    ))}

                {currentTab === 'Bands' &&
                    bands.map((item) => (
                        <div
                            key={item.id}
                            className="list-item"
                            onClick={() =>
                                onNavigate({
                                    screen: 'Band',
                                    params: { selectedBandId: item.id },
                                })
                            }>
                            <div className="list-item-title">{item.name}</div>
                        </div>
                    ))}

                {currentTab === 'Songs' &&
                    songs.map((item) => (
                        <SongItem
                            key={item.id}
                            id={item.id}
                            name={item.name}
                            band_name={item.band_name}
                            ft_band_name=""
                            onNavigate={onNavigate}
                            originStr={item.band_name}
                        />
                    ))}
            </main>

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

/* -------------------------------------------------------------------------- */
/*                                 BAND SCREEN                                */
/* -------------------------------------------------------------------------- */
function BandScreen({ routeParams, onNavigate, onBack }) {
    const { selectedBandId } = routeParams;

    const [bandModalVisible, setBandModalVisible] = useState(false);
    const [bandName, setBandName] = useState('');
    const [bandSongs, setBandSongs] = useState([]);
    const [bandFeaturing, setBandFeaturing] = useState([]);

    const [bandSearchVisible, setBandSearchVisible] = useState(false);
    const [bandOrderStr, setBandOrderStr] = useState('');
    const [bandSearchStr, setBandSearchStr] = useState('');

    useEffect(() => {
        executeQuery('SELECT name FROM bands WHERE id = ?;', [selectedBandId])
            .then((data) => {
                if (data.rows.length > 0) {
                    setBandName(data.rows.item(0).name); // index 0 means we count on unique id
                }
            })
            .catch((err) => console.error(err));

        const hasSearch = bandSearchStr !== '';
        const searchClause = hasSearch ? ' AND (songs.name LIKE ?)' : '';
        const queryParams = hasSearch ? [selectedBandId, `%${bandSearchStr}%`] : [selectedBandId];

        const queryStr = 'SELECT id, name FROM songs WHERE band_id = ?';
        executeQuery(queryStr + searchClause + bandOrderStr + ';', queryParams)
            .then((data) => {
                const tmp = [];
                for (let i = 0; i < data.rows.length; i++) {
                    tmp.push(data.rows.item(i));
                }
                setBandSongs(tmp);
            })
            .catch((err) => console.error(err));

        const queryFtStr =
            'SELECT songs.id, songs.name, bands.name AS ft_band_name FROM songs INNER JOIN bands ON songs.band_id = bands.id WHERE songs.id IN (SELECT song_id FROM songs_ft_bands WHERE ft_band_id = ?)';
        executeQuery(queryFtStr + searchClause + bandOrderStr + ';', queryParams)
            .then((data) => {
                const tmp = [];
                for (let i = 0; i < data.rows.length; i++) {
                    tmp.push(data.rows.item(i));
                }
                setBandFeaturing(tmp);
            })
            .catch((err) => console.error(err));
    }, [selectedBandId, bandOrderStr, bandSearchStr]);

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
                <div className="search-bar">
                    <input
                        className="search-input"
                        autoFocus
                        placeholder="Search in band..."
                        value={bandSearchStr}
                        onChange={(e) => setBandSearchStr(e.target.value)}
                    />
                    <button className="icon-btn" onClick={() => setBandSearchStr('')}>
                        x
                    </button>
                </div>
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
                            <button className="btn-primary" onClick={() => setBandModalVisible(false)}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

/* -------------------------------------------------------------------------- */
/*                               PLAYLIST SCREEN                              */
/* -------------------------------------------------------------------------- */
function PlaylistScreen({ routeParams, onNavigate, onBack }) {
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
                const tmp = [];
                for (let i = 0; i < data.rows.length; i++) {
                    tmp.push(data.rows.item(i));
                }
                setPlaylistSongs(tmp);
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

            <main className="content-scroll">
                {playlistSongs.map((item) => (
                    <SongItem
                        key={item.id}
                        id={item.id}
                        name={item.name}
                        band_name={item.band_name}
                        ft_band_name=""
                        onNavigate={onNavigate}
                        originStr={playlistName}
                    />
                ))}
            </main>

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

/* -------------------------------------------------------------------------- */
/*                                 SONG SCREEN                                */
/* -------------------------------------------------------------------------- */
function SongScreen({ routeParams, onNavigate, onBack }) {
    const { selectedSongId, originStr } = routeParams;
    const { transposition } = useContext(AppContext);

    const [songModalVisible, setSongModalVisible] = useState(false);
    const [songData, setSongData] = useState(null);
    const [bandName, setBandName] = useState('');
    const [featuringBands, setFeaturingBands] = useState([]);

    // Pinch-to-zoom and single-tap reset state
    const [fontSize, setFontSize] = useState(14);
    const pinchStartDistRef = useRef(null);
    const pinchStartSizeRef = useRef(14);

    useEffect(() => {
        let isMounted = true;

        async function loadSong() {
            try {
                const songRes = await executeQuery('SELECT * FROM songs WHERE id = ?;', [
                    selectedSongId,
                ]);
                if (!songRes.rows.length) {
                    return;
                }
                const tmpSong = songRes.rows.item(0); // index 0 means we count on unique id

                const [bandRes, ftRes] = await Promise.all([
                    executeQuery('SELECT name FROM bands WHERE id = ?;', [tmpSong.band_id]),
                    executeQuery(
                        'SELECT id, name FROM bands WHERE id IN (SELECT ft_band_id FROM songs_ft_bands WHERE song_id = ?);',
                        [selectedSongId]
                    ),
                ]);

                if (!isMounted) {
                    return;
                }

                setSongData(tmpSong);
                if (bandRes.rows.length > 0) {
                    setBandName(bandRes.rows.item(0).name);
                }

                const ftArr = [];
                for (let i = 0; i < ftRes.rows.length; i++) {
                    ftArr.push(ftRes.rows.item(i));
                }
                setFeaturingBands(ftArr);
            } catch (err) {
                console.error(err);
            }
        }

        loadSong();
        return () => {
            isMounted = false;
        };
    }, [selectedSongId]);

    const songScreenItems = useMemo(() => {
        if (!songData) {
            return [];
        }

        const tmpSongScreenItems = [];

        if (songData.capo) {
            if (songData.capo < 1) {
                tmpSongScreenItems.push(
                    <strong key="drop">
                        (chords for drop {-songData.capo} semitones){'\n\n'}
                    </strong>
                );
            } else {
                tmpSongScreenItems.push(
                    <strong key="capo">
                        (chords for capo on {songData.capo}){'\n\n'}
                    </strong>
                );
            }
        }

        const lyrics = songData.contents || '';
        const re1 = /\((.+?)\)/g;
        let array1;
        let counter = 0;
        let outerLastIndex = 0;

        while ((array1 = re1.exec(lyrics)) !== null) {
            //console.log("here: "+array1);// prints:"(chords),chords"
            tmpSongScreenItems.push(
                <span key={counter}>
                    {lyrics.slice(outerLastIndex, re1.lastIndex - array1[0].length)}
                </span>
            );
            //console.log("---");
            //console.log("- "+array1[0]);
            let chordGroup = array1[1];
            let transposedStr = '(';
            let innerDone = false;

            while (innerDone === false) {
                //console.log("** chordGroup: ["+chordGroup+"]");
                const prefilter = /bpm/g.exec(chordGroup);
                if (prefilter !== null) {
                    transposedStr += chordGroup;
                    innerDone = true;
                    continue;
                }
                const delimiter = /  |_|!|riff|sus4|\.\.\.|\.\./g.exec(chordGroup);
                if (delimiter !== null) {
                    //console.log("** At "+delimiter.index+" found delimiter ["+delimiter+"] of size: "+delimiter[0].length);
                    const treatable = chordGroup.slice(0, delimiter.index);
                    chordGroup = chordGroup.slice(
                        delimiter.index + delimiter[0].length,
                        chordGroup.length
                    );
                    if (delimiter.index === 0) {
                        transposedStr += delimiter;
                        continue;
                    }
                    //console.log("** treatable: {"+treatable+"}");
                    transposedStr += transposeChordToken(treatable, transposition);
                    transposedStr += delimiter;
                    continue;
                }
                //Transposer.transpose(chord).up(0).toString();
                //console.log("** Pre-END!");
                if (chordGroup.length > 0) {
                    //console.log("** treatable: {"+chordGroup+"}");
                    transposedStr += transposeChordToken(chordGroup, transposition);
                }
                //console.log("** END!");
                innerDone = true;
            }
            transposedStr += ')';
            //console.log("+ "+transposedStr);
            tmpSongScreenItems.push(<strong key={counter + 1}>{transposedStr}</strong>);
            counter = counter + 2;
            outerLastIndex = re1.lastIndex;
        }

        tmpSongScreenItems.push(
            <span key={counter}>{lyrics.slice(outerLastIndex, lyrics.length)}</span>
        );

        return tmpSongScreenItems;
    }, [songData, transposition]);

    // Touch pinch-to-zoom handlers
    const handleTouchStart = (e) => {
        if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            pinchStartDistRef.current = Math.hypot(dx, dy);
            pinchStartSizeRef.current = fontSize;
        }
    };

    const handleTouchMove = (e) => {
        if (e.touches.length === 2 && pinchStartDistRef.current) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.hypot(dx, dy);
            const scale = dist / pinchStartDistRef.current;
            setFontSize(Math.max(10, Math.min(36, Math.round(pinchStartSizeRef.current * scale))));
        }
    };

    const handleTouchEnd = () => {
        pinchStartDistRef.current = null;
    };

    const songName = songData ? songData.name : '';
    const headerTitle = songName === '' ? '' : `${songName} [${originStr}]`;

    return (
        <>
            <header className="app-header">
                <div className="header-left">
                    <button className="icon-btn" onClick={onBack}>
                        <ArrowLeft size={22} />
                    </button>
                    <h1 className="header-title">{headerTitle}</h1>
                </div>
                <div className="header-actions">
                    <button className="btn-primary" onClick={() => setSongModalVisible(true)}>
                        Info
                    </button>
                </div>
            </header>

            <main
                className="content-scroll song-sheet-container"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onDoubleClick={() => setFontSize(14)}>
                <div className="song-lyrics-monospace" style={{ fontSize: `${fontSize}px` }}>
                    {songScreenItems}
                </div>
            </main>

            {songModalVisible && songData && (
                <div className="modal-backdrop" onClick={() => setSongModalVisible(false)}>
                    <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                        <div
                            style={{
                                borderBottom: '1px solid black',
                                paddingBottom: 15,
                                lineHeight: 1.6,
                            }}>
                            <div>Song: {songData.name}</div>
                            {bandName && <div>Band: {bandName}</div>}
                            {songData.album && <div>Album: {songData.album}</div>}
                            {songData.track && <div>Track: {songData.track}</div>}
                            {songData.author && <div>Author: {songData.author}</div>}
                            {songData.writer && songData.writer !== songData.author && (
                                <div>Writer: {songData.writer}</div>
                            )}
                            {songData.bpm && <div>Bpm: {songData.bpm}</div>}
                            {songData.capo ? (
                                songData.capo < 1 ? (
                                    <div>Drop: {-songData.capo}</div>
                                ) : (
                                    <div>Capo: {songData.capo}</div>
                                )
                            ) : null}
                            {songData.key && <div>Key: {songData.key}</div>}
                            {songData.time_signature && (
                                <div>Time signature: {songData.time_signature}</div>
                            )}
                            {songData.falsetto && <div>Falsetto: {songData.falsetto}</div>}
                            {songData.highest && <div>Highest: {songData.highest}</div>}
                            {songData.lang && <div>Lang: {songData.lang}</div>}
                            {songData.license && <div>License: {songData.license}</div>}
                            {songData.isrc && <div>ISRC: {songData.isrc}</div>}
                            {songData.url && (
                                <div>
                                    URL:{' '}
                                    <a href={songData.url} target="_blank" rel="noreferrer">
                                        {songData.url}
                                    </a>
                                </div>
                            )}
                            {songData.spotify && (
                                <div>
                                    Spotify:{' '}
                                    <a
                                        href={
                                            songData.spotify.startsWith('http')
                                                ? songData.spotify
                                                : `https://open.spotify.com/track/${songData.spotify}`
                                        }
                                        target="_blank"
                                        rel="noreferrer">
                                        {songData.spotify}
                                    </a>
                                </div>
                            )}
                            {featuringBands.length > 0 && (
                                <div>
                                    Featuring:{' '}
                                    {featuringBands.map((ft, idx) => (
                                        <span key={ft.id}>
                                            <span
                                                style={{ cursor: 'pointer', textDecoration: 'underline' }}
                                                onClick={() => {
                                                    setSongModalVisible(false);
                                                    onNavigate({
                                                        screen: 'Band',
                                                        params: { selectedBandId: ft.id },
                                                    });
                                                }}>
                                                {ft.name}
                                            </span>
                                            {idx < featuringBands.length - 1 ? '; ' : ''}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {songData.content_hash && (
                                <div style={{ fontSize: '0.78rem', color: '#666', marginTop: 6 }}>
                                    Hash: <code>{songData.content_hash}</code>
                                </div>
                            )}
                        </div>

                        <div
                            style={{
                                borderBottom: '1px solid black',
                                padding: '15px 0',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}>
                            <span>Transposition: {transposition}</span>
                            <span>Font size: {fontSize}px</span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 15 }}>
                            <button
                                className="btn-primary"
                                onClick={() => setSongModalVisible(false)}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

/* -------------------------------------------------------------------------- */
/*                               SETTINGS SCREEN                              */
/* -------------------------------------------------------------------------- */
function SettingsScreen({ onBack }) {
    const {
        transposition,
        setTransposition,
        activeDbLabel,
        setActiveDbLabel,
        setDbRevision,
    } = useContext(AppContext);

    const fileInputRef = useRef(null);

    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) {
            return;
        }
        try {
            await loadExternalDatabaseFile(file);
            setActiveDbLabel(file.name);
            setDbRevision((r) => r + 1);
        } catch (err) {
            console.error('Failed to load external database:', err);
        }
    };

    const handleResetDb = async () => {
        try {
            await resetToDefaultDatabase();
            setActiveDbLabel('Default (Small Hotel Room)');
            setDbRevision((r) => r + 1);
        } catch (err) {
            console.error('Failed to reset database:', err);
        }
    };

    return (
        <>
            <header className="app-header">
                <div className="header-left">
                    <button className="icon-btn" onClick={onBack}>
                        <ArrowLeft size={22} />
                    </button>
                    <h1 className="header-title">Settings</h1>
                </div>
            </header>

            <main className="content-scroll">
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 15,
                        gap: 10,
                    }}>
                    <div style={{ flex: 4 }}>Transposition: {transposition}</div>
                    <button
                        className="btn-primary"
                        onClick={() => setTransposition(transposition + 1)}>
                        UP
                    </button>
                    <button
                        className="btn-primary"
                        onClick={() => setTransposition(transposition - 1)}>
                        DOWN
                    </button>
                    <button className="btn-primary" onClick={() => setTransposition(0)}>
                        RESET
                    </button>
                </div>

                <div style={{ padding: '0 15px 15px 15px' }}>
                    <div>Examples:</div>
                    <div>{'\u2022'} Song says Capo on 2, but play without capo: 2</div>
                    <div>{'\u2022'} Song says Drop 2, but play without untuning: -2</div>
                </div>

                <div
                    style={{
                        padding: '0 15px 15px 15px',
                        borderBottom: '1px solid black',
                    }}>
                    <div>Examples for Ukelele:</div>
                    <div>{'\u2022'} Play most songs on Ukelele: -5</div>
                    <div>{'\u2022'} Play song on Ukelele, but song says Capo on 2: -3</div>
                </div>

                {/* Songbook Database Pack Loader (Local / Offline Extension) */}
                <div style={{ padding: 15, borderBottom: '1px solid black' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: 8 }}>
                        Songbook Database Pack
                    </div>
                    <div style={{ marginBottom: 12, fontSize: '0.9rem' }}>
                        Active DB: <strong>{activeDbLabel}</strong>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".db,.sqlite,.sqlite3"
                            style={{ display: 'none' }}
                            onChange={handleFileUpload}
                        />
                        <button
                            className="btn-primary"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                            onClick={() => fileInputRef.current?.click()}>
                            <Upload size={16} /> Load External .db Pack
                        </button>
                        <button
                            className="btn-primary"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                background: '#4b5563',
                            }}
                            onClick={handleResetDb}>
                            <RotateCcw size={16} /> Reset to Default DB
                        </button>
                    </div>
                </div>
            </main>
        </>
    );
}

/* -------------------------------------------------------------------------- */
/*                                MAIN ROUTER                                 */
/* -------------------------------------------------------------------------- */
function MainNavigator() {
    const [history, setHistory] = useState([{ screen: 'Home', params: {} }]);

    const currentRoute = history[history.length - 1];

    const navigate = (nextRoute) => {
        setHistory((prev) => [...prev, nextRoute]);
    };

    const goBack = () => {
        setHistory((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
    };

    return (
        <div className="app-shell">
            {currentRoute.screen === 'Home' && <HomeScreen onNavigate={navigate} />}
            {currentRoute.screen === 'Band' && (
                <BandScreen
                    routeParams={currentRoute.params}
                    onNavigate={navigate}
                    onBack={goBack}
                />
            )}
            {currentRoute.screen === 'Playlist' && (
                <PlaylistScreen
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
        </div>
    );
}

export default function App() {
    return (
        <AppProvider>
            <MainNavigator />
        </AppProvider>
    );
}
