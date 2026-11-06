# File: acordismo-config.yaml
# Version: 1.0.0
# Single Source of Truth for Acordismo App Defaults, PDF Generation, and Database Layers.

app:
  default_transposition: 0
  default_dark_mode: false
  default_font_size: 14
  min_font_size: 10
  max_font_size: 36
  default_freeze_chords: true
  default_scroll_speed: 1.0
  min_scroll_speed: 0.0
  max_scroll_speed: 3.0
  scroll_target_duration_seconds: 210
  default_system_bars_native: true
  default_system_bars_web: false
  default_tab: "Playlists"
  default_playlist_order: "Original"
  default_band_order: "ASC"
  default_song_order: "ASC"
  default_db_label: "Default (Small Hotel Room)"

pdf:
  default_palette: "color" # "color" (uses SYNTAX_PALETTE.light) or "bw" (uses SYNTAX_PALETTE.pdfBw)
  default_db: "public/songs.db"
  output_dir: "dist-pdfs"
  paper_size: "a4paper"
  font_size: "10pt"
  margin: "1.6cm"

merged_output: "dist-dbs/songs-all.db"

layers:
  - id: "official"
    output: "dist-dbs/songs-official.db"
    also_copy_to: "public/songs.db"
    sources:
      - type: "markdown_dir"
        path: "${ACORDISMO_OFFICIAL_DIR:-../smallhotelroom.github.io/src/contents/songs}"
        playlist: "★ Small Hotel Room"
    playlists:
      - name: "★ cancionesdejuan"
        match: "cancionesdejuan - *"

  - id: "curated"
    output: "dist-dbs/songs-curated.db"
    sources:
      - type: "markdown_dir"
        path: "${ACORDISMO_CURATED_DIR}/English"
        playlist: "English"
      - type: "markdown_dir"
        path: "${ACORDISMO_CURATED_DIR}/Español"
        playlist: "Español"
      - type: "markdown_dir"
        path: "${ACORDISMO_CURATED_DIR}/Français"
        playlist: "Français"
      - type: "markdown_dir"
        path: "${ACORDISMO_CURATED_DIR}/Italiano"
        playlist: "Italiano"
      - type: "markdown_dir"
        path: "${ACORDISMO_CURATED_DIR}/日本"
        playlist: "日本"
      - type: "markdown_dir"
        path: "${ACORDISMO_CURATED_DIR}/Português"
        playlist: "Português"
    playlists:
      - name: "★ Metal, Rock y Punk"
        from_file: "${ACORDISMO_CURATED_LISTS_DIR}/metal_rock_punk.txt"

  - id: "crawler"
    output: "dist-dbs/songs-crawler.db"
    sources:
      - type: "dataset_zk"
        path: "${ACORDISMO_CRAWLER_ZK_DIR}"
        subdir: "${ACORDISMO_CRAWLER_ZK_SUBDIR}"
        cache: "${ACORDISMO_CRAWLER_CACHE_DIR}"
        playlist: "OrigenZK"
        max_errors: 5
      - type: "dataset_lk"
        path: "${ACORDISMO_CRAWLER_LK_DIR}"
        subdir: "${ACORDISMO_CRAWLER_LK_SUBDIR}"
        cache: "${ACORDISMO_CRAWLER_CACHE_DIR}"
        playlist: "OrigenLK"
        max_errors: 5
