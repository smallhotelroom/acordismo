/**
 * @file src/components/SongItem.jsx
 * @version 2.4.0
 */
import React from 'react';

export const __version__ = '2.4.0';

export default function SongItem({ id, name, band_name, ft_band_name, onNavigate, originStr }) {
    return (
        <div
            className="list-item"
            style={{ height: '68px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
            onClick={() =>
                onNavigate({
                    screen: 'Song',
                    params: { selectedSongId: id, originStr },
                })
            }>
            <div
                className="list-item-title"
                style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {name}
            </div>
            {band_name === '' ? null : ft_band_name === '' ? (
                <div
                    className="list-item-subtitle"
                    style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {band_name}
                </div>
            ) : (
                <div
                    className="list-item-subtitle"
                    style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {ft_band_name}; {band_name}
                </div>
            )}
        </div>
    );
}
