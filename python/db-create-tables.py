#!/usr/bin/env python
__version__ = "2.1.0"

import sys
import sqlite3
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

    print("----------------")
    print("db-create-tables")
    print("----------------")

    parser = argparse.ArgumentParser(formatter_class=MyArgumentDefaultsHelpFormatter)

    parser.add_argument('--db',
                        help='name of the db file',
                        default='songs.db')
    parser.add_argument('--yes',
                        help='accept all, skip all queries',
                        nargs='?',
                        default='NULL')  # required, see below
    args = parser.parse_args()

    skipQueries = False
    if args.yes != 'NULL':  # if exists and no contents, replaces 'NULL' by None
        print("Detected --yes parameter: will skip queries")
        skipQueries = True

    dbFile = query("Please specify the name of the database file", args.db, skipQueries)
    print("Will use the db file: " + dbFile)

    # Create database tables (if they do not exist)
    conn = sqlite3.connect(dbFile)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS songs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content_hash VARCHAR,
            name VARCHAR,
            band_id INTEGER,
            origin_id INTEGER,
            album VARCHAR,
            author VARCHAR,
            bpm REAL,
            capo INTEGER,
            falsetto VARCHAR,
            highest VARCHAR,
            isrc VARCHAR,
            key VARCHAR,
            lang VARCHAR,
            license VARCHAR,
            musicians VARCHAR,
            spotify VARCHAR,
            time_signature VARCHAR,
            track INTEGER,
            url VARCHAR,
            writer VARCHAR,
            contents VARCHAR
        );
    """)
    conn.execute("CREATE TABLE IF NOT EXISTS bands (id INTEGER PRIMARY KEY AUTOINCREMENT, name VARCHAR);")
    conn.execute("CREATE TABLE IF NOT EXISTS playlists (id INTEGER PRIMARY KEY AUTOINCREMENT, name VARCHAR);")
    conn.execute("CREATE TABLE IF NOT EXISTS playlists_songs (id INTEGER PRIMARY KEY AUTOINCREMENT, playlist_id INTEGER, song_id INTEGER);")
    conn.execute("CREATE TABLE IF NOT EXISTS songs_ft_bands (id INTEGER PRIMARY KEY AUTOINCREMENT, song_id INTEGER, ft_band_id INTEGER);")

    conn.commit()
    print("Operation done successfully")
    conn.close()
