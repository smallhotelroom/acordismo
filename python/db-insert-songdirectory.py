#!/usr/bin/env python
__version__ = "2.1.0"

import sys
import os
import json
import hashlib
import sqlite3
import frontmatter  # python-frontmatter
import argparse
import readline

readline.set_completer_delims(' \t\n;')
readline.parse_and_bind("tab: complete")
readline.parse_and_bind("set match-hidden-files off")

def query(question, default, skipQuery=False):
    if skipQuery:
        return default
    sys.stdout.write(question + " [" + default + "] ? ")
    choice = input()
    if choice == '':
        return default
    return choice

def serialize_field(val):
    if val is None:
        return None
    if isinstance(val, (list, dict)):
        return json.dumps(val, ensure_ascii=False)
    return str(val)

class MyArgumentDefaultsHelpFormatter(argparse.HelpFormatter):
    def _split_lines(self, text, width):
        return text.splitlines()

    def _get_help_string(self, action):
        help = action.help
        if '%(default)' not in action.help:
            if action.default is not argparse.SUPPRESS:
                defaulting_nargs = [argparse.OPTIONAL, argparse.ZERO_OR_MORE]
                if action.option_strings or action.nargs in defaulting_nargs:
                    help += ' (default: "%(default)s")'
        return help

if __name__ == '__main__':
    print("-----------------------")
    print("db-insert-songdirectory")
    print("-----------------------")

    parser = argparse.ArgumentParser(formatter_class=MyArgumentDefaultsHelpFormatter)
    parser.add_argument('--input', help='path of the default song input directory', default='examples/')
    parser.add_argument('--db', help='name of the db file', default='songs.db')
    parser.add_argument('--playlist', help='output playlist', default='PlaylistOfExamples')
    parser.add_argument('--yes', help='accept all, skip all queries', nargs='?', default='NULL')
    args = parser.parse_args()

    skipQueries = args.yes != 'NULL'
    if skipQueries:
        print("Detected --yes parameter: will skip queries")

    inputDirectory = query("Please specify the path of the song input directory", args.input, skipQueries)
    print("Will use song input directory: " + inputDirectory)
    if not os.path.isdir(inputDirectory):
        sys.exit("Specified input directory does not exist")

    dbFile = query("Please specify the name of the database file", args.db, skipQueries)
    print("Will use the db file: " + dbFile)

    playlistName = query("Please specify the name of the output playlist", args.playlist, skipQueries)
    print("Will output to the playlist: " + playlistName)

    # Connect to database
    conn = sqlite3.connect(dbFile)
    cursor = conn.cursor()

    # Cache bands and playlists in memory to avoid repeated SELECT queries
    band_cache = {row[1]: row[0] for row in cursor.execute("SELECT id, name FROM bands")}

    cursor.execute("SELECT id FROM playlists WHERE name = ?", (playlistName,))
    playlist_row = cursor.fetchone()

    if playlist_row:
        playlistId = playlist_row[0]
    else:
        cursor.execute("INSERT INTO playlists (name) VALUES (?);", (playlistName,))
        playlistId = cursor.lastrowid

    # Includes both legacy Cordismo keys and songSchema.js v1.6.0 STRICT_PROJECT_KEYS
    treatedKeys = {
        'album', 'artist', 'author', 'bpm', 'capo', 'drop', 'falsetto',
        'featuring', 'highest', 'isrc', 'key', 'lang', 'license',
        'musicians', 'spotify', 'time_signature', 'title', 'track', 'url', 'writer'
    }

    for dirname, dirnames, filenames in os.walk(inputDirectory):
        for filename in sorted(filenames):
            if not filename.endswith('.md') and not filename.endswith('.txt'):
                continue
            name, extension = os.path.splitext(filename)
            print('* ' + name)

            try:
                bandName, songName = name.split(' - ', 1)
            except ValueError:
                print(f"** Skipping {filename}: Invalid format (missing ' - ')")
                continue

            # Band resolution via cache
            if bandName in band_cache:
                bandId = band_cache[bandName]
            else:
                cursor.execute("INSERT INTO bands (name) VALUES (?);", (bandName,))
                bandId = cursor.lastrowid
                band_cache[bandName] = bandId

            with open(os.path.join(dirname, filename), encoding='utf8') as f:
                song = frontmatter.load(f)

                # Resolve attributes dynamically (supporting both songSchema.js v1.6.0 and legacy keys)
                album = song.get('album', None)
                author = song.get('author', None)
                bpm = song.get('bpm', None)
                capo = song.get('capo', None)
                if 'drop' in song:
                    capo = -song['drop']  # drop overwrites capo in original logic

                falsetto = song.get('falsetto', None)
                highest = song.get('highest', None)
                isrc = song.get('isrc', None)
                song_key = song.get('key', None)
                lang = song.get('lang', None)
                license_str = song.get('license', None)
                musicians = serialize_field(song.get('musicians', None))
                spotify = song.get('spotify', None)
                time_sig = str(song['time_signature']) if 'time_signature' in song else None
                track = song.get('track', None)
                url = song.get('url', None)
                writer = song.get('writer', author)  # fallback to author if writer not set

                # Deterministic Git-like SHA-256 hash (first 16 hex chars) for P2P / pack deduplication
                raw_hash_input = f"{bandName.strip()}|{songName.strip()}|{song.content.strip()}"
                content_hash = hashlib.sha256(raw_hash_input.encode('utf-8')).hexdigest()[:16]

                cursor.execute("""
                    INSERT INTO songs (
                        content_hash, name, band_id, origin_id, album, author, bpm, capo,
                        falsetto, highest, isrc, key, lang, license, musicians, spotify,
                        time_signature, track, url, writer, contents
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """, (
                    content_hash, songName, bandId, 0, album, author, bpm, capo,
                    falsetto, highest, isrc, song_key, lang, license_str, musicians, spotify,
                    time_sig, track, url, writer, song.content
                ))

                songId = cursor.lastrowid

                # Handle untreated keys logging
                untreatedKeys = [k for k in song.keys() if k not in treatedKeys]
                if untreatedKeys:
                    print("** untreatedKeys:", untreatedKeys)

                # Handle featuring bands
                if 'featuring' in song:
                    print("** song['featuring']:", song['featuring'])
                    for featuringBandNameSpaces in song['featuring'].split(";"):
                        featuringBandName = featuringBandNameSpaces.strip()
                        print("*** featuringBandName:", featuringBandName)

                        if featuringBandName in band_cache:
                            print("*** Existing band via featuring, id:", band_cache[featuringBandName])
                            featuringBandId = band_cache[featuringBandName]
                        else:
                            cursor.execute("INSERT INTO bands (name) VALUES (?);", (featuringBandName,))
                            print("*** New band via featuring, id:", cursor.lastrowid)
                            featuringBandId = cursor.lastrowid
                            band_cache[featuringBandName] = featuringBandId

                        cursor.execute("INSERT INTO songs_ft_bands (song_id, ft_band_id) VALUES (?, ?);", (songId, featuringBandId))

            cursor.execute("INSERT INTO playlists_songs (playlist_id, song_id) VALUES (?, ?);", (playlistId, songId))

    conn.commit()
    print("Operation done successfully")
    conn.close()
