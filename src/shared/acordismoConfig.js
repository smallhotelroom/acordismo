/**
 * @file src/shared/acordismoConfig.js
 * @version 1.3.0
 * Universal zero-dependency parser for `acordismo-config.yaml` (shared by React App and Node scripts).
 */

export const __version__ = '1.3.0';

export const FALLBACK_ACORDISMO_CONFIG = {
    app: {
        default_transposition: 0,
        default_dark_mode: false,
        default_font_size: 14,
        min_font_size: 10,
        max_font_size: 36,
        default_freeze_chords: true,
        default_hide_crawler_tabs: true,
        default_chord_diagrams: true,
        default_chord_instrument: 'guitar',
        default_metronome_bpm: 120,
        default_metronome_subdivision: 1,
        default_metronome_sound: 'natural',
        default_metronome_persistent: true,
        default_scroll_speed: 1.0,
        min_scroll_speed: 0.0,
        max_scroll_speed: 3.0,
        scroll_target_duration_seconds: 210,
        default_system_bars_native: true,
        default_system_bars_web: false,
        default_tab: 'Playlists',
        default_playlist_order: 'Original',
        default_band_order: 'ASC',
        default_song_order: 'ASC',
        default_db_label: 'Default (Small Hotel Room)',
    },
    pdf: {
        default_palette: 'color',
        default_db: 'public/songs.db',
        output_dir: 'dist-pdfs',
        paper_size: 'a4paper',
        font_size: '10pt',
        margin: '1.6cm',
    },
    merged_output: 'dist-dbs/songs-all.db',
    layers: [],
};

function parseScalarValue(rawVal) {
    const s = String(rawVal || '').trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        return s.slice(1, -1);
    }
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
    return s;
}

/**
 * Parses `acordismo-config.yaml` into a structured config object.
 */
export function parseAcordismoConfigYaml(yamlText = '') {
    const config = {
        app: { ...FALLBACK_ACORDISMO_CONFIG.app },
        pdf: { ...FALLBACK_ACORDISMO_CONFIG.pdf },
        merged_output: FALLBACK_ACORDISMO_CONFIG.merged_output,
        layers: [],
    };

    let topSection = null;
    let currentLayer = null;
    let currentLayerSubSection = null;
    let currentItem = null;

    for (const rawLine of String(yamlText || '').split(/\r?\n/)) {
        const stripped = rawLine.replace(/\s+#.*$/, '').trimEnd();
        const trimmed = stripped.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }

        const indent = stripped.search(/\S/);

        if (indent === 0) {
            if (trimmed === 'app:') {
                topSection = 'app';
                currentLayer = null;
            } else if (trimmed === 'pdf:') {
                topSection = 'pdf';
                currentLayer = null;
            } else if (trimmed === 'layers:') {
                topSection = 'layers';
                currentLayer = null;
            } else if (trimmed.startsWith('merged_output:')) {
                topSection = null;
                config.merged_output = parseScalarValue(
                    trimmed.slice('merged_output:'.length)
                );
            }
            continue;
        }

        if (indent === 2 && (topSection === 'app' || topSection === 'pdf')) {
            const colonIdx = trimmed.indexOf(':');
            if (colonIdx !== -1) {
                const k = trimmed.slice(0, colonIdx).trim();
                const v = parseScalarValue(trimmed.slice(colonIdx + 1));
                config[topSection][k] = v;
            }
            continue;
        }

        if (indent === 2 && trimmed.startsWith('- id:')) {
            topSection = 'layers';
            currentLayer = {
                id: parseScalarValue(trimmed.slice('- id:'.length)),
                output: null,
                also_copy_to: null,
                sources: [],
                playlists: [],
            };
            config.layers.push(currentLayer);
            currentLayerSubSection = null;
            currentItem = null;
            continue;
        }

        if (!currentLayer) {
            continue;
        }

        if (indent === 4) {
            if (trimmed === 'sources:') {
                currentLayerSubSection = 'sources';
                currentItem = null;
            } else if (trimmed === 'playlists:') {
                currentLayerSubSection = 'playlists';
                currentItem = null;
            } else {
                const colonIdx = trimmed.indexOf(':');
                if (colonIdx !== -1) {
                    const k = trimmed.slice(0, colonIdx).trim();
                    const v = parseScalarValue(trimmed.slice(colonIdx + 1));
                    currentLayer[k] = v;
                }
            }
            continue;
        }

        if (indent === 6 && trimmed.startsWith('- ')) {
            currentItem = {};
            if (currentLayerSubSection === 'sources') {
                currentLayer.sources.push(currentItem);
            } else if (currentLayerSubSection === 'playlists') {
                currentLayer.playlists.push(currentItem);
            }
            const rest = trimmed.slice(2);
            const colonIdx = rest.indexOf(':');
            if (colonIdx !== -1) {
                const k = rest.slice(0, colonIdx).trim();
                const v = parseScalarValue(rest.slice(colonIdx + 1));
                currentItem[k] = v;
            }
            continue;
        }

        if (indent >= 8 && currentItem) {
            const colonIdx = trimmed.indexOf(':');
            if (colonIdx !== -1) {
                const k = trimmed.slice(0, colonIdx).trim();
                const v = parseScalarValue(trimmed.slice(colonIdx + 1));
                currentItem[k] = v;
            }
        }
    }

    return config;
}
