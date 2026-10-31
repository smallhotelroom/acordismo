/**
 * @file src/components/SongItem.jsx
 * @version 2.8.3
 */
import React from 'react';

export const __version__ = '2.8.3';

const singleLineEllipsisStyle = {
    whiteSpace: 'nowrap',
    overflowX: 'clip',
    textOverflow: 'ellipsis',
    flexShrink: 0,
};

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
            <div className="list-item-title" style={singleLineEllipsisStyle}>
                {name}
            </div>
            {band_name === '' ? null : ft_band_name === '' ? (
                <div className="list-item-subtitle" style={singleLineEllipsisStyle}>
                    {band_name}
                </div>
            ) : (
                <div className="list-item-subtitle" style={singleLineEllipsisStyle}>
                    {ft_band_name}; {band_name}
                </div>
            )}
        </div>
    );
}