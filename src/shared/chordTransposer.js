/**
 * @file src/shared/chordTransposer.js
 * @version 2.4.0
 */
import { transpose } from 'chord-transposer';

export const __version__ = '2.4.0';

export function transposeChordToken(token, transposition) {
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
