/**
 * @file src/shared/songSchema.js
 * @version 3.0.0
 * Single Source of Truth (hosted in Acordismo) for Frontmatter Schema, Draconian
 * Case-Sensitive Chord Grammar, Custom Tuning Parser (`parseInstrumentTuning`),
 * Markdown `##` Section & Harmonic Fingering Postures Schema, Reverse Chord Voicing
 * Identification (`suggestChordsForVoicing`), Default Posture Previewer (`getDefaultPostureForChord`),
 * and Syntax Highlighting Palettes.
 */

export const __version__ = '3.0.0';

export const BASE_REQUIRED_KEYS = [];

export const STRICT_PROJECT_NAMES = [
  "Small Hotel Room", 
  "cancionesdejuan"
];

export const STRICT_PROJECT_KEYS = [
  "album", 
  "author",
  "bpm",
  "isrc",
  "lang",
  "license",
  "musicians", 
  "spotify",
  "track",
  "url"
];

export const TREATED_KEYS = [
  "album",
  "artist",
  "author",
  "bpm",
  "capo",
  "downloads",
  "drop",
  "falsetto",
  "featuring",
  "highest",
  "initNote",
  "isrc",
  "key",
  "lang",
  "license",
  "musicians",
  "scores",
  "spotify",
  "time_signature",
  "title",
  "track",
  "tuning",
  "url",
  "writer",
  "youtube"
];

// --- INLINE CHORD NOTATION GRAMMAR (DRACONIAN CASE-SENSITIVE) ---
export const SHARP_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLAT_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export const NOTE_TO_SEMITONE = {
  C: 0,
  'B#': 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  F: 5,
  'E#': 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
  Cb: 11,
};

// Standard open-string MIDI pitches & pitch classes (0=C .. 11=B)
export const GUITAR_OPEN_MIDI = [40, 45, 50, 55, 59, 64]; // E2, A2, D3, G3, B3, E4
export const GUITAR_OPEN_PITCH_CLASSES = [4, 9, 2, 7, 11, 4]; // 6E, 5A, 4D, 3G, 2B, 1e
export const GUITAR_STRING_NAMES = ['E', 'A', 'D', 'G', 'B', 'e'];
export const GUITAR_STRING_LABELS = ['6 (E)', '5 (A)', '4 (D)', '3 (G)', '2 (B)', '1 (e)'];

export const UKULELE_OPEN_MIDI = [67, 60, 64, 69]; // G4, C4, E4, A4
export const UKULELE_OPEN_PITCH_CLASSES = [7, 0, 4, 9]; // 4G, 3C, 2E, 1A
export const UKULELE_STRING_NAMES = ['G', 'C', 'E', 'A'];
export const UKULELE_STRING_LABELS = ['4 (G)', '3 (C)', '2 (E)', '1 (A)'];

/**
 * Parses a YAML `tuning:` frontmatter string for Guitar (6 strings) or Ukulele (4 strings).
 * Supports BOTH:
 *   1. Semitone offsets per string: e.g. `-2 0 -2 -2 -2 0` (Cracks: lowering 1 tone on strings 6, 4, 3, 2)
 *   2. Exact uppercase note names:  e.g. `D A C F A E` or `D2 A2 C3 F3 A3 E4`
 */
export const parseInstrumentTuning = (rawTuning = null, instrument = 'guitar') => {
  const isUke = instrument === 'ukulele';
  const baseMidis = isUke ? UKULELE_OPEN_MIDI : GUITAR_OPEN_MIDI;
  const basePcs = isUke ? UKULELE_OPEN_PITCH_CLASSES : GUITAR_OPEN_PITCH_CLASSES;
  const baseNames = isUke ? UKULELE_STRING_NAMES : GUITAR_STRING_NAMES;
  const baseLabels = isUke ? UKULELE_STRING_LABELS : GUITAR_STRING_LABELS;
  const expectedCount = baseMidis.length;

  const defaultResult = {
    valid: true,
    isCustom: false,
    openMidis: [...baseMidis],
    openPcs: [...basePcs],
    stringNames: [...baseNames],
    stringLabels: [...baseLabels],
    offsets: new Array(expectedCount).fill(0),
    displayStr: baseNames.join(' '),
  };

  if (!rawTuning || typeof rawTuning !== 'string' || !rawTuning.trim()) {
    return defaultResult;
  }

  const tokens = rawTuning
    .trim()
    .split(/[\s,;]+/)
    .filter(Boolean);

  if (tokens.length !== expectedCount) {
    if (isUke && tokens.length === 6) {
      return defaultResult;
    }
    return {
      ...defaultResult,
      valid: false,
      error: `Invalid tuning '${rawTuning}': expected ${expectedCount} string values (e.g. 'D A C F A E' or '-2 0 -2 -2 -2 0'), found ${tokens.length}.`,
    };
  }

  const openMidis = [];
  const openPcs = [];
  const stringNames = [];
  const stringLabels = [];
  const offsets = [];

  for (let i = 0; i < expectedCount; i++) {
    const tok = tokens[i];
    const stringNumber = expectedCount - i;

    if (/^[+-]?\d+$/.test(tok)) {
      const off = parseInt(tok, 10);
      if (off < -12 || off > 12) {
        return {
          ...defaultResult,
          valid: false,
          error: `Tuning offset '${tok}' on string ${stringNumber} out of range (-12..+12).`,
        };
      }
      const midi = baseMidis[i] + off;
      const pc = ((basePcs[i] + off) % 12 + 12) % 12;
      const noteName = SHARP_NOTES[pc];
      const dispName = i === expectedCount - 1 && !isUke ? noteName.toLowerCase() : noteName;
      openMidis.push(midi);
      openPcs.push(pc);
      stringNames.push(dispName);
      stringLabels.push(`${stringNumber} (${noteName})`);
      offsets.push(off);
      continue;
    }

    // Strict case-sensitive note name ("D", "F#", "Eb", or "D2")
    const noteMatch = /^([A-G][#b]?)(\d)?$/.exec(tok);
    if (!noteMatch || NOTE_TO_SEMITONE[noteMatch[1]] === undefined) {
      return {
        ...defaultResult,
        valid: false,
        error: `Invalid tuning token '${tok}' on string ${stringNumber} (use uppercase note names like 'D A C F A E' or semitone offsets like '-2 0 -2 -2 -2 0').`,
      };
    }

    const canonicalNote = noteMatch[1];
    const targetPc = NOTE_TO_SEMITONE[canonicalNote];

    let diff = (targetPc - basePcs[i] + 12) % 12;
    if (diff > 4) {
      diff -= 12;
    }
    const midi = noteMatch[2]
      ? (parseInt(noteMatch[2], 10) + 1) * 12 + targetPc
      : baseMidis[i] + diff;
    const off = midi - baseMidis[i];
    const dispName =
      i === expectedCount - 1 && !isUke && canonicalNote.length === 1
        ? canonicalNote.toLowerCase()
        : canonicalNote;

    openMidis.push(midi);
    openPcs.push(targetPc);
    stringNames.push(dispName);
    stringLabels.push(`${stringNumber} (${canonicalNote})`);
    offsets.push(off);
  }

  const isCustom = offsets.some((o) => o !== 0);
  const offsetSummary = offsets
    .map((o, idx) =>
      o !== 0 ? `${expectedCount - idx}:${o > 0 ? `+${o}` : o}` : null
    )
    .filter(Boolean)
    .join(', ');

  return {
    valid: true,
    isCustom,
    openMidis,
    openPcs,
    stringNames,
    stringLabels,
    offsets,
    displayStr: isCustom
      ? `${stringNames.join(' ')} (${offsetSummary})`
      : stringNames.join(' '),
  };
};

// Parenthetical metadata/directives that should never be transposed as chords
export const SKIP_PAREN_PREFIXES = [
  '(bpm',
  '(tempo',
  '(key',
  '(highest',
  '(falsetto',
  '(all',
  '(chords for',
];

// Unified regex for parenthetical directives
export const DIRECTIVE_PAREN_REGEX =
  /bpm|tempo|key|highest|falsetto|all|chords for|capo|drop/i;

// Delimiters & playing annotations allowed inside (...) chord blocks
export const CHORD_GROUP_DELIMITER_REGEX =
  /  |_|!|\.\.\.|\.\.|: |\*|high|open|bass|riff|palm mute|notes/;

// DRACONIAN CASE-SENSITIVE chord quality/modifier suffixes after the root note
export const CHORD_QUALITY_REGEX =
  /^(?:m|maj|min|dim|aug|sus|add|[0-9]|[#b+-]|M|\(|\))*$/;

// --- MARKDOWN `##` SECTIONS & PLAIN-TEXT CHORD FINGERING SCHEMA ---
export const SECTION_HEADER_REGEX = /^##\s+(.+?)\s*$/;
// Case-insensitive section header match so `## Chords`, `## Fingerings`, etc. are always recognized!
export const FINGERING_SECTION_HEADER_REGEX =
  /^(?:chords?|fingerings?|voicings?|postures?|acordes?|posiciones?)$/i;
export const NOTES_SECTION_HEADER_REGEX =
  /^(?:notes?|notas?|comments?|tabs?|tablature)$/i;

/**
 * Canonical chord interval definitions (in semitones above root) for harmonic validation
 * and reverse chord-name identification (`suggestChordsForVoicing`).
 */
export const CHORD_FORMULAS = [
  { suffix: '', aliases: ['M', 'maj'], allowed: [0, 4, 7], required: [0, 4], priority: 10 },
  { suffix: 'm', aliases: ['min', '-'], allowed: [0, 3, 7], required: [0, 3], priority: 10 },
  { suffix: '5', aliases: [], allowed: [0, 7], required: [0, 7], noExtraNotes: true, priority: 9 },
  { suffix: '7', aliases: [], allowed: [0, 4, 7, 10], required: [0, 4, 10], shellRequired: [0, 10], priority: 9 },
  { suffix: 'maj7', aliases: ['M7'], allowed: [0, 4, 7, 11], required: [0, 4, 11], shellRequired: [0, 11], priority: 9 },
  { suffix: 'm7', aliases: ['min7', '-7'], allowed: [0, 3, 7, 10], required: [0, 3, 10], priority: 9 },
  { suffix: 'sus2', aliases: ['2'], allowed: [0, 2, 7], required: [0, 2], priority: 8 },
  { suffix: 'sus4', aliases: ['sus'], allowed: [0, 5, 7], required: [0, 5], priority: 8 },
  { suffix: '7sus4', aliases: ['7sus'], allowed: [0, 5, 7, 10], required: [0, 5, 10], priority: 8 },
  { suffix: 'add9', aliases: ['add2'], allowed: [0, 2, 4, 7], required: [0, 2, 4], priority: 8 },
  { suffix: 'm(add9)', aliases: ['madd9', 'madd2'], allowed: [0, 2, 3, 7], required: [0, 2, 3], priority: 8 },
  { suffix: '6', aliases: ['maj6'], allowed: [0, 4, 7, 9], required: [0, 4, 9], priority: 7 },
  { suffix: 'm6', aliases: ['min6'], allowed: [0, 3, 7, 9], required: [0, 3, 9], priority: 7 },
  { suffix: 'dim', aliases: ['o'], allowed: [0, 3, 6], required: [0, 3, 6], priority: 7 },
  { suffix: 'dim7', aliases: ['o7'], allowed: [0, 3, 6, 9], required: [0, 3, 6, 9], priority: 7 },
  { suffix: 'm7b5', aliases: ['m7-5', 'ø'], allowed: [0, 3, 6, 10], required: [0, 3, 6, 10], priority: 7 },
  { suffix: 'aug', aliases: ['+', '+5'], allowed: [0, 4, 8], required: [0, 4, 8], priority: 7 },
  { suffix: '7#5', aliases: ['7+5', '7+', 'aug7'], allowed: [0, 4, 8, 10], required: [0, 4, 8, 10], priority: 6 },
  { suffix: '7b5', aliases: ['7-5'], allowed: [0, 4, 6, 10], required: [0, 4, 6, 10], priority: 6 },
  { suffix: '7b9', aliases: ['7-9'], allowed: [0, 1, 4, 7, 10], required: [0, 1, 4, 10], priority: 6 },
  { suffix: '9', aliases: [], allowed: [0, 2, 4, 7, 10], required: [0, 2, 4, 10], shellRequired: [0, 2, 10], priority: 7 },
  { suffix: 'm9', aliases: ['min9'], allowed: [0, 2, 3, 7, 10], required: [0, 2, 3, 10], priority: 7 },
  { suffix: 'maj9', aliases: ['M9'], allowed: [0, 2, 4, 7, 11], required: [0, 2, 4, 11], shellRequired: [0, 2, 11], priority: 7 },
  { suffix: '9sus4', aliases: [], allowed: [0, 2, 5, 7, 10], required: [0, 2, 5, 10], priority: 6 },
  { suffix: 'm(maj7)', aliases: ['mmaj7', 'mM7', 'minmaj7'], allowed: [0, 3, 7, 11], required: [0, 3, 11], priority: 6 },
];

/**
 * Draconian case-sensitive formula lookup.
 */
export const findChordFormula = (rawQuality = '') => {
  const q = String(rawQuality || '').trim().replace(/^\(|\)$/g, '');
  for (const f of CHORD_FORMULAS) {
    if (f.suffix === q || f.aliases.includes(q)) {
      return f;
    }
  }
  return null;
};

/**
 * Computes the allowed, required, and optional shell-required pitch classes (0..11) for a chord.
 */
export const getChordExpectedPitchClasses = (rootSemitone, rawQuality = '', bassSemitone = null) => {
  const formula = findChordFormula(rawQuality);
  if (!formula) {
    return null;
  }

  const allowedPcs = new Set(formula.allowed.map((iv) => (rootSemitone + iv) % 12));
  const requiredPcs = new Set(formula.required.map((iv) => (rootSemitone + iv) % 12));
  const shellRequiredPcs = formula.shellRequired
    ? new Set(formula.shellRequired.map((iv) => (rootSemitone + iv) % 12))
    : null;

  if (bassSemitone !== null && bassSemitone !== undefined) {
    allowedPcs.add(bassSemitone);
    requiredPcs.add(bassSemitone);
    if (shellRequiredPcs) shellRequiredPcs.add(bassSemitone);
  }

  return { allowedPcs, requiredPcs, shellRequiredPcs, noExtraNotes: Boolean(formula.noExtraNotes) };
};

/**
 * Reverse-identifies the most likely chord names (with confidence %) for a given fret array,
 * accounting for custom song tuning (`customTuningStr`) and/or pitch shift (`pitchShiftSemitones`).
 */
export const suggestChordsForVoicing = (
  frets,
  instrument = 'guitar',
  {
    targetRootSemitone = null,
    targetRootStr = null,
    maxResults = 3,
    customTuningStr = null,
    pitchShiftSemitones = 0,
  } = {}
) => {
  if (!Array.isArray(frets) || (frets.length !== 6 && frets.length !== 4)) {
    return [];
  }

  const tuningInfo = parseInstrumentTuning(customTuningStr, instrument);
  const openPcs = tuningInfo.openPcs;
  const soundedPcs = new Set();
  let lowestSoundedPc = null;

  for (let i = 0; i < frets.length; i++) {
    const f = frets[i];
    if (f < 0) continue;
    const pc = ((openPcs[i] + f + pitchShiftSemitones) % 12 + 12) % 12;
    if (lowestSoundedPc === null) {
      lowestSoundedPc = pc;
    }
    soundedPcs.add(pc);
  }

  if (soundedPcs.size === 0) {
    return [];
  }

  const soundedArr = [...soundedPcs];
  const candidateRoots =
    targetRootSemitone !== null && targetRootSemitone !== undefined
      ? [targetRootSemitone]
      : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  const scoredCandidates = [];

  for (const rootPc of candidateRoots) {
    const rootName =
      targetRootSemitone === rootPc && targetRootStr
        ? targetRootStr
        : SHARP_NOTES[rootPc];

    for (const formula of CHORD_FORMULAS) {
      const allowedSet = new Set(formula.allowed.map((iv) => (rootPc + iv) % 12));
      const requiredArr = formula.required.map((iv) => (rootPc + iv) % 12);

      const matchingCount = soundedArr.filter((pc) => allowedSet.has(pc)).length;
      const wrongCount = soundedArr.length - matchingCount;
      const presentReqCount = requiredArr.filter((pc) => soundedPcs.has(pc)).length;
      const missingReqCount = requiredArr.length - presentReqCount;
      const unplayedAllowedCount = Math.max(0, allowedSet.size - matchingCount);

      if (formula.noExtraNotes && wrongCount > 0) continue;
      if (matchingCount === 0 || wrongCount > 1) continue;
      if (targetRootSemitone === null && !soundedPcs.has(rootPc)) continue;

      const bassMatchesRoot = lowestSoundedPc === rootPc;
      let chordLabel = `${rootName}${formula.suffix}`;
      let confidence = 0;
      let tier = 0;

      if (wrongCount === 0 && missingReqCount === 0) {
        if (instrument === 'guitar' && !bassMatchesRoot && lowestSoundedPc !== null) {
          chordLabel = `${rootName}${formula.suffix}/${SHARP_NOTES[lowestSoundedPc]}`;
          confidence = Math.max(
            78,
            Math.round(92 - unplayedAllowedCount * 4 + formula.priority * 0.2)
          );
          tier = 2;
        } else {
          confidence = Math.min(
            100,
            Math.round(100 - unplayedAllowedCount * 5)
          );
          tier = 3;
        }
      } else if (wrongCount === 0 && missingReqCount === 1 && soundedPcs.has(rootPc)) {
        const hasShellReq =
          formula.shellRequired &&
          formula.shellRequired.every((iv) => soundedPcs.has((rootPc + iv) % 12));
        const bassBonus = bassMatchesRoot ? 6 : 0;
        const shellBonus = hasShellReq ? 5 : 0;
        if (instrument === 'guitar' && !bassMatchesRoot && lowestSoundedPc !== null) {
          chordLabel = `${rootName}${formula.suffix}/${SHARP_NOTES[lowestSoundedPc]}`;
        }
        confidence = Math.min(
          96,
          Math.round(84 + bassBonus + shellBonus + formula.priority * 0.3 - unplayedAllowedCount * 2)
        );
        tier = 2;
      } else {
        const noteAccuracy = matchingCount / soundedArr.length;
        const reqCoverage = presentReqCount / requiredArr.length;
        const bassBonus = bassMatchesRoot ? 8 : 0;
        confidence = Math.round(
          noteAccuracy * 40 +
            reqCoverage * 34 +
            bassBonus +
            formula.priority * 0.5 -
            unplayedAllowedCount * 3
        );
        confidence = Math.max(20, Math.min(82, confidence));
        tier = 1;
      }

      scoredCandidates.push({
        chord: chordLabel,
        confidence,
        tier,
        unplayedAllowedCount,
        priority: formula.priority,
      });
    }
  }

  scoredCandidates.sort((a, b) => {
    if (b.tier !== a.tier) return b.tier - a.tier;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    if (a.unplayedAllowedCount !== b.unplayedAllowedCount) {
      return a.unplayedAllowedCount - b.unplayedAllowedCount;
    }
    return b.priority - a.priority;
  });

  const unique = [];
  const seen = new Set();
  for (const item of scoredCandidates) {
    if (seen.has(item.chord)) continue;
    seen.add(item.chord);
    unique.push({ chord: item.chord, confidence: item.confidence });
    if (unique.length >= maxResults) break;
  }

  return unique;
};

export const formatChordSuggestionsText = (suggestions = []) => {
  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    return '';
  }
  const listStr = suggestions
    .map((s) => `${s.chord} (${s.confidence}%)`)
    .join(', ');
  return ` Did you mean: ${listStr}?`;
};

const DEFAULT_GUITAR_OPEN_SHAPES = {
  '0:': [-1, 3, 2, 0, 1, 0],
  '0:7': [-1, 3, 2, 3, 1, 0],
  '0:maj7': [-1, 3, 2, 0, 0, 0],
  '0:add9': [-1, 3, 2, 0, 3, 0],
  '0:sus2': [-1, 3, 0, 0, 1, 3],
  '2:': [-1, -1, 0, 2, 3, 2],
  '2:m': [-1, -1, 0, 2, 3, 1],
  '2:7': [-1, -1, 0, 2, 1, 2],
  '2:maj7': [-1, -1, 0, 2, 2, 2],
  '2:m7': [-1, -1, 0, 2, 1, 1],
  '2:sus2': [-1, -1, 0, 2, 3, 0],
  '2:sus4': [-1, -1, 0, 2, 3, 3],
  '4:': [0, 2, 2, 1, 0, 0],
  '4:m': [0, 2, 2, 0, 0, 0],
  '4:7': [0, 2, 0, 1, 0, 0],
  '4:maj7': [0, 2, 1, 1, 0, 0],
  '4:m7': [0, 2, 0, 0, 0, 0],
  '5:maj7': [-1, -1, 3, 2, 1, 0],
  '7:': [3, 2, 0, 0, 0, 3],
  '7:7': [3, 2, 0, 0, 0, 1],
  '7:maj7': [3, 2, 0, 0, 0, 2],
  '9:': [-1, 0, 2, 2, 2, 0],
  '9:m': [-1, 0, 2, 2, 1, 0],
  '9:7': [-1, 0, 2, 0, 2, 0],
  '9:maj7': [-1, 0, 2, 1, 2, 0],
  '9:m7': [-1, 0, 2, 0, 1, 0],
  '9:sus2': [-1, 0, 2, 2, 0, 0],
  '9:sus4': [-1, 0, 2, 2, 3, 0],
  '11:7': [-1, 2, 1, 2, 0, 2],
};

export const formatFretsCompact = (frets = []) => {
  if (!Array.isArray(frets) || frets.length === 0) return '';
  const needsSpaces = frets.some((f) => f >= 10);
  return frets
    .map((f) => (f < 0 ? 'x' : String(f)))
    .join(needsSpaces ? ' ' : '');
};

export const getDefaultPostureForChord = (
  rootSemitone,
  rawQuality = '',
  bassSemitone = null,
  instrument = 'guitar',
  customTuningStr = null
) => {
  const formula = findChordFormula(rawQuality);
  if (!formula) return null;

  const targetBass =
    bassSemitone !== null && bassSemitone !== undefined ? bassSemitone : rootSemitone;
  const expected = getChordExpectedPitchClasses(rootSemitone, rawQuality, bassSemitone);
  if (!expected) return null;

  const solveForOpenPcs = (openPcs) => {
    if (
      instrument === 'guitar' &&
      openPcs.every((pc, i) => pc === GUITAR_OPEN_PITCH_CLASSES[i]) &&
      bassSemitone === null
    ) {
      const key = `${rootSemitone}:${formula.suffix}`;
      if (DEFAULT_GUITAR_OPEN_SHAPES[key]) {
        return [...DEFAULT_GUITAR_OPEN_SHAPES[key]];
      }
    }

    let bestFrets = null;
    let bestScore = -999;

    for (let base = 0; base <= 7; base++) {
      const candidate = [];
      let bassFound = false;

      for (let s = 0; s < openPcs.length; s++) {
        const strPc = openPcs[s];
        const options = [];
        for (let f = 0; f <= base + 3; f++) {
          if (f !== 0 && f < base) continue;
          const pc = (strPc + f) % 12;
          if (expected.allowedPcs.has(pc)) {
            options.push({ f, pc });
          }
        }

        if (!bassFound && instrument === 'guitar') {
          const bassOpt = options.find((o) => o.pc === targetBass);
          if (bassOpt && s <= 2) {
            candidate.push(bassOpt.f);
            bassFound = true;
            continue;
          } else if (s < 2) {
            candidate.push(-1);
            continue;
          }
        }

        if (options.length === 0) {
          candidate.push(-1);
        } else {
          options.sort((a, b) => a.f - b.f);
          candidate.push(options[0].f);
          if (options[0].pc === targetBass) bassFound = true;
        }
      }

      const soundedPcs = new Set();
      let lowestPc = null;
      let activeCount = 0;
      for (let i = 0; i < candidate.length; i++) {
        if (candidate[i] >= 0) {
          const pc = (openPcs[i] + candidate[i]) % 12;
          if (lowestPc === null) lowestPc = pc;
          soundedPcs.add(pc);
          activeCount++;
        }
      }

      const allReqPresent = [...expected.requiredPcs].every((pc) => soundedPcs.has(pc));
      if (!allReqPresent || activeCount < 3) continue;

      const bassMatch = lowestPc === targetBass ? 25 : 0;
      const openBonus = candidate.filter((f) => f === 0).length * 3;
      const lowPosBonus = (8 - base) * 2;
      const score = bassMatch + activeCount * 4 + openBonus + lowPosBonus;

      if (score > bestScore) {
        bestScore = score;
        bestFrets = candidate;
      }
    }

    return bestFrets;
  };

  const stdPcs =
    instrument === 'ukulele' ? UKULELE_OPEN_PITCH_CLASSES : GUITAR_OPEN_PITCH_CLASSES;
  const stdFrets = solveForOpenPcs(stdPcs);

  const tuningInfo = parseInstrumentTuning(customTuningStr, instrument);
  const customFrets = tuningInfo.isCustom ? solveForOpenPcs(tuningInfo.openPcs) : stdFrets;

  return {
    stdFretsStr: stdFrets ? formatFretsCompact(stdFrets) : null,
    customFretsStr: customFrets ? formatFretsCompact(customFrets) : null,
    isCustomTuning: tuningInfo.isCustom,
    tuningDisplay: tuningInfo.stringNames.join(' '),
  };
};

export const validateVoicingHarmony = (
  chordName,
  rootSemitone,
  quality,
  bassSemitone,
  frets,
  instrument = 'guitar',
  rootStr = null,
  customTuningStr = null
) => {
  const expected = getChordExpectedPitchClasses(rootSemitone, quality, bassSemitone);
  if (!expected) {
    return { valid: true, suggestions: [] };
  }

  const { allowedPcs, requiredPcs, shellRequiredPcs } = expected;
  const tuningInfo = parseInstrumentTuning(customTuningStr, instrument);
  const openPcs = tuningInfo.openPcs;
  const strLabels = tuningInfo.stringLabels;

  const soundedPcs = new Set();
  const wrongNotes = [];
  let lowestSoundedPc = null;

  for (let i = 0; i < frets.length; i++) {
    const f = frets[i];
    if (f < 0) continue;
    const pc = (openPcs[i] + f) % 12;
    if (lowestSoundedPc === null) {
      lowestSoundedPc = pc;
    }
    soundedPcs.add(pc);
    if (!allowedPcs.has(pc)) {
      wrongNotes.push(`String ${strLabels[i]} fret ${f} plays ${SHARP_NOTES[pc]}`);
    }
  }

  if (soundedPcs.size === 0) {
    return {
      valid: false,
      suggestions: [],
      error: `Fingering for '${chordName}' mutes all strings.`,
    };
  }

  const expectedNoteNames = [...allowedPcs].map((pc) => SHARP_NOTES[pc]).join(', ');
  const issues = [];

  if (wrongNotes.length > 0) {
    issues.push(
      `${wrongNotes.join(', ')} (not in ${chordName} [${expectedNoteNames}])`
    );
  }

  const satisfiesShellVoicing =
    wrongNotes.length === 0 &&
    shellRequiredPcs &&
    [...shellRequiredPcs].every((pc) => soundedPcs.has(pc));

  if (!satisfiesShellVoicing) {
    const missingReq = [...requiredPcs]
      .filter((pc) => !soundedPcs.has(pc))
      .map((pc) => SHARP_NOTES[pc]);
    if (missingReq.length > 0) {
      issues.push(`missing required chord tone(s): ${missingReq.join(', ')}`);
    }
  }

  if (
    instrument === 'guitar' &&
    bassSemitone !== null &&
    bassSemitone !== undefined &&
    lowestSoundedPc !== null &&
    lowestSoundedPc !== bassSemitone
  ) {
    issues.push(
      `slash bass '/${SHARP_NOTES[bassSemitone]}' requires lowest sounded string to be ${SHARP_NOTES[bassSemitone]} (found ${SHARP_NOTES[lowestSoundedPc]})`
    );
  }

  if (issues.length > 0) {
    let suggestions = suggestChordsForVoicing(frets, instrument, {
      targetRootSemitone: rootSemitone,
      targetRootStr: rootStr || SHARP_NOTES[rootSemitone],
      maxResults: 3,
      customTuningStr,
    }).filter((s) => s.chord !== chordName && s.confidence >= 70);

    if (suggestions.length === 0 || suggestions[0].confidence < 90) {
      const globalSuggs = suggestChordsForVoicing(frets, instrument, {
        maxResults: 3,
        customTuningStr,
      }).filter((s) => s.chord !== chordName);
      const seen = new Set(suggestions.map((s) => s.chord));
      for (const gs of globalSuggs) {
        if (!seen.has(gs.chord)) {
          suggestions.push(gs);
          seen.add(gs.chord);
        }
        if (suggestions.length >= 3) break;
      }
    }

    const tuningNote = tuningInfo.isCustom
      ? ` [in tuning ${tuningInfo.stringNames.join(' ')}]`
      : '';
    return {
      valid: false,
      suggestions,
      error: `Harmonic mismatch in '${chordName}'${tuningNote}: ${issues.join('; ')}.${formatChordSuggestionsText(suggestions)}`,
    };
  }

  return { valid: true, suggestions: [] };
};

const parseFretPatternRightSide = (rawRightSide = '', explicitInstrument = null, chordNameForMsg = '') => {
  let rightSide = String(rawRightSide || '').trim();
  let label = null;
  const quoteMatch = /^(.*?)\s+["'](.+)["']\s*$/.exec(rightSide);
  if (quoteMatch) {
    rightSide = quoteMatch[1].trim();
    label = quoteMatch[2].trim();
  }

  let rawFretTokens = [];
  if (/^[xX0-9]{4}$/.test(rightSide) || /^[xX0-9]{6}$/.test(rightSide)) {
    rawFretTokens = rightSide.split('');
  } else {
    rawFretTokens = rightSide.split(/[\s,-]+/).filter(Boolean);
  }

  if (rawFretTokens.length !== 6 && rawFretTokens.length !== 4) {
    return {
      valid: false,
      error: `Fret pattern '${rightSide}' for '${chordNameForMsg}' must have 6 strings (Guitar, e.g. '022030') or 4 strings (Ukulele, e.g. '0212'); found ${rawFretTokens.length}.`,
    };
  }

  const frets = [];
  for (const tok of rawFretTokens) {
    if (/^[xX]$/.test(tok)) {
      frets.push(-1);
    } else if (/^\d+$/.test(tok)) {
      const fNum = parseInt(tok, 10);
      if (fNum < 0 || fNum > 24) {
        return {
          valid: false,
          error: `Fret number '${fNum}' out of range (0..24) in '${chordNameForMsg}: ${rightSide}'.`,
        };
      }
      frets.push(fNum);
    } else {
      return {
        valid: false,
        error: `Invalid fret token '${tok}' in '${chordNameForMsg}: ${rightSide}' (use digits 0-24 or 'x').`,
      };
    }
  }

  const inferredInstrument = frets.length === 4 ? 'ukulele' : 'guitar';
  const instrument = explicitInstrument || inferredInstrument;

  if (
    (instrument === 'guitar' && frets.length !== 6) ||
    (instrument === 'ukulele' && frets.length !== 4)
  ) {
    return {
      valid: false,
      error: `Instrument '${instrument}' does not match ${frets.length}-string fret pattern '${rightSide}'.`,
    };
  }

  return {
    valid: true,
    frets,
    instrument,
    label,
  };
};

export const parseFingeringDefinitionLine = (rawLine = '', customTuningStr = null) => {
  const trimmed = String(rawLine || '').replace(/\s+#.*$/, '').trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const colonIdx = trimmed.indexOf(':');
  let leftSide = '';
  let rightSide = '';

  if (colonIdx === -1) {
    const spaceMatch = /^(\S+)\s+(.+)$/.exec(trimmed);
    if (spaceMatch) {
      const candidateRight = parseFretPatternRightSide(spaceMatch[2], null, spaceMatch[1]);
      if (candidateRight.valid) {
        const suggs = suggestChordsForVoicing(
          candidateRight.frets,
          candidateRight.instrument,
          { maxResults: 3, customTuningStr }
        );
        return {
          valid: false,
          suggestions: suggs,
          error: `Missing ':' after '${spaceMatch[1]}'.${formatChordSuggestionsText(suggs)}`,
        };
      }
    }
    return {
      valid: false,
      error: `Missing ':' separator in chord fingering line (expected e.g. 'Em7: 022030' or 'Em7:' to preview default).`,
    };
  }

  leftSide = trimmed.slice(0, colonIdx).trim();
  rightSide = trimmed.slice(colonIdx + 1).trim();

  let explicitInstrument = null;
  let chordName = leftSide;
  const instMatch = /^(\S+)\s+\((guitar|gtr|uke|ukulele)\)$/i.exec(leftSide);
  if (instMatch) {
    chordName = instMatch[1].trim();
    const tag = instMatch[2].toLowerCase();
    explicitInstrument = tag.startsWith('uk') ? 'ukulele' : 'guitar';
  }

  const chordMatch = /^([A-G][#b]?)([^/]*?)(?:\/([A-G][#b]?))?$/.exec(chordName);
  const isChordSyntaxValid =
    Boolean(chordMatch) &&
    NOTE_TO_SEMITONE[chordMatch[1]] !== undefined &&
    CHORD_QUALITY_REGEX.test(chordMatch[2] || '') &&
    findChordFormula(chordMatch[2] || '') !== null &&
    (!chordMatch[3] || NOTE_TO_SEMITONE[chordMatch[3]] !== undefined);

  if (!rightSide) {
    if (!isChordSyntaxValid) {
      return {
        valid: false,
        error: `Invalid chord name '${chordName}'.`,
      };
    }
    const rootSemitone = NOTE_TO_SEMITONE[chordMatch[1]];
    const quality = chordMatch[2] || '';
    const bassSemitone = chordMatch[3] ? NOTE_TO_SEMITONE[chordMatch[3]] : null;
    const targetInst = explicitInstrument || 'guitar';
    const defPosture = getDefaultPostureForChord(
      rootSemitone,
      quality,
      bassSemitone,
      targetInst,
      customTuningStr
    );

    if (defPosture) {
      if (defPosture.isCustomTuning && targetInst === 'guitar') {
        const customHint = defPosture.customFretsStr
          ? `suggested posture for tuning [${defPosture.tuningDisplay}]: '${defPosture.customFretsStr}'`
          : `specify a 6-string posture for tuning [${defPosture.tuningDisplay}]`;
        return {
          valid: false,
          error: `Empty fingering for '${chordName}'. Standard tuning default is '${defPosture.stdFretsStr || 'n/a'}', which will NOT sound in tune in [${defPosture.tuningDisplay}] — ${customHint}.`,
        };
      }
      return {
        valid: false,
        error: `Empty fingering for '${chordName}'. Default ${targetInst} posture is '${defPosture.stdFretsStr}' (omit this line to use the default, or type a custom pattern).`,
      };
    }
    return {
      valid: false,
      error: `Empty fingering for '${chordName}'. Please provide a ${targetInst === 'ukulele' ? '4' : '6'}-string fret pattern.`,
    };
  }

  const fretParse = parseFretPatternRightSide(rightSide, explicitInstrument, chordName);

  if (!isChordSyntaxValid) {
    let suggestionSuffix = '';
    let suggestions = [];
    if (fretParse.valid) {
      const rootPrefixMatch = /^([A-G][#b]?)/.exec(chordName);
      const rootHintSemitone =
        rootPrefixMatch && NOTE_TO_SEMITONE[rootPrefixMatch[1]] !== undefined
          ? NOTE_TO_SEMITONE[rootPrefixMatch[1]]
          : null;
      suggestions = suggestChordsForVoicing(fretParse.frets, fretParse.instrument, {
        targetRootSemitone: rootHintSemitone,
        targetRootStr: rootPrefixMatch ? rootPrefixMatch[1] : null,
        maxResults: 3,
        customTuningStr,
      });
      if (suggestions.length === 0 && rootHintSemitone !== null) {
        suggestions = suggestChordsForVoicing(fretParse.frets, fretParse.instrument, {
          maxResults: 3,
          customTuningStr,
        });
      }
      suggestionSuffix = formatChordSuggestionsText(suggestions);
    }
    return {
      valid: false,
      suggestions,
      error: `Invalid chord name '${chordName}' in fingering definition.${suggestionSuffix}`,
    };
  }

  if (!fretParse.valid) {
    return {
      valid: false,
      suggestions: [],
      error: fretParse.error,
    };
  }

  const rootStr = chordMatch[1];
  const rootSemitone = NOTE_TO_SEMITONE[rootStr];
  const quality = chordMatch[2] || '';
  const bassSemitone = chordMatch[3] ? NOTE_TO_SEMITONE[chordMatch[3]] : null;

  const harmonyCheck = validateVoicingHarmony(
    chordName,
    rootSemitone,
    quality,
    bassSemitone,
    fretParse.frets,
    fretParse.instrument,
    rootStr,
    customTuningStr
  );
  if (!harmonyCheck.valid) {
    return {
      valid: false,
      suggestions: harmonyCheck.suggestions || [],
      error: harmonyCheck.error,
    };
  }

  return {
    valid: true,
    chordName,
    instrument: fretParse.instrument,
    frets: fretParse.frets,
    label: fretParse.label,
    suggestions: [],
  };
};

export const validateMarkdownSections = (
  bodyContent = '',
  bodyStartLine = 1,
  customTuningStr = null
) => {
  const diagnostics = [];
  const lines = String(bodyContent || '').replace(/\r\n/g, '\n').split('\n');
  let currentSectionType = 'main';
  const seenHeaders = new Set();

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const fileLine = bodyStartLine + i;

    if (rawLine.startsWith('##')) {
      const match = SECTION_HEADER_REGEX.exec(rawLine);
      if (!match) {
        diagnostics.push({
          line: fileLine,
          message: `Malformed section header '${rawLine}'. Expected '## Section Name'.`,
        });
        continue;
      }
      const title = match[1].trim();
      if (seenHeaders.has(title)) {
        diagnostics.push({
          line: fileLine,
          message: `Duplicate section header '## ${title}'.`,
        });
      }
      seenHeaders.add(title);

      if (FINGERING_SECTION_HEADER_REGEX.test(title)) {
        currentSectionType = 'fingerings';
      } else if (NOTES_SECTION_HEADER_REGEX.test(title)) {
        currentSectionType = 'notes';
      } else {
        currentSectionType = 'translation';
      }
      continue;
    }

    if (currentSectionType === 'fingerings') {
      const parsed = parseFingeringDefinitionLine(rawLine, customTuningStr);
      if (parsed && !parsed.valid) {
        diagnostics.push({
          line: fileLine,
          message: parsed.error,
        });
      }
    }
  }

  return diagnostics;
};

// --- SHARED SYNTAX HIGHLIGHTING PALETTE (Linter + SongScreen + PDF) ---
export const SYNTAX_PALETTE = {
  dark: {
    parenBg: 'rgba(121, 192, 255, 0.06)',
    parenSymbol: '#b392f0',
    chord: '#79c0ff',
    modifier: '#b392f0',
    directive: '#d29922',
    choir: '#7ee787',
  },
  light: {
    parenBg: 'rgba(9, 105, 218, 0.06)',
    parenSymbol: '#6e40c9',
    chord: '#0969da',
    modifier: '#6e40c9',
    directive: '#b45309',
    choir: '#1a7f37',
  },
  pdfBw: {
    parenBg: 'transparent',
    parenSymbol: '#6e6e6e',
    chord: '#000000',
    modifier: '#6e6e6e',
    directive: '#4b5563',
    choir: '#525252',
  },
};

export const validateAlphabeticalOrder = (keys) => {
  const sortedKeys = [...keys].sort();
  const isValid = keys.every((key, index) => key === sortedKeys[index]);
  
  return {
    isValid,
    expected: sortedKeys
  };
};

export const getMissingKeys = (frontmatterData, rawFileName = "") => {
  let requiredForThisFile = [...BASE_REQUIRED_KEYS];
  let derivedArtist = frontmatterData.artist;
  
  if (!derivedArtist && rawFileName.includes(' - ')) {
    derivedArtist = rawFileName.split(' - ')[0].trim();
  }

  if (STRICT_PROJECT_NAMES.includes(derivedArtist)) {
    requiredForThisFile = [...requiredForThisFile, ...STRICT_PROJECT_KEYS];
  }

  return requiredForThisFile.filter(reqKey => 
    frontmatterData[reqKey] === undefined || frontmatterData[reqKey] === null
  );
};

export const validateFrontmatter = (frontmatterData, rawFileName = "") => {
  const errors = [];
  const keys = Object.keys(frontmatterData);

  const missing = getMissingKeys(frontmatterData, rawFileName);
  if (missing.length > 0) {
    errors.push(`Missing required keys: ${missing.join(', ')}`);
  }

  const { isValid, expected } = validateAlphabeticalOrder(keys);
  if (!isValid) {
    errors.push(`Keys are not in alphabetical order. Expected: \n${expected.join('\n')}`);
  }

  if (frontmatterData.tuning) {
    const tCheck = parseInstrumentTuning(String(frontmatterData.tuning), 'guitar');
    if (!tCheck.valid) {
      errors.push(tCheck.error);
    }
  }

  return errors;
};

export const parseFrontmatterFile = (rawText) => {
  const normalized = String(rawText || '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return {
      hasFrontmatter: false,
      data: {},
      keyLines: {},
      bodyStartLine: 1,
      content: normalized,
    };
  }
  const endIdx = normalized.indexOf('\n---\n', 4);
  if (endIdx === -1) {
    return {
      hasFrontmatter: false,
      data: {},
      keyLines: {},
      bodyStartLine: 1,
      content: normalized,
    };
  }

  const yamlBlock = normalized.slice(4, endIdx);
  const lines = yamlBlock.split('\n');
  const rawAfterClose = normalized.slice(endIdx + 5);
  const strippedLeadingNewline = rawAfterClose.startsWith('\n');
  const bodyStartLine = lines.length + 3 + (strippedLeadingNewline ? 1 : 0);
  const content = strippedLeadingNewline ? rawAfterClose.slice(1) : rawAfterClose;
  const data = {};
  const keyLines = {};

  const parseScalar = (rawVal) => {
    const val = rawVal.trim();
    if (val === '') return '';
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      return val.slice(1, -1);
    }
    if (/^-?\d+$/.test(val)) return parseInt(val, 10);
    if (/^-?\d+\.\d+$/.test(val)) return parseFloat(val, 10);
    return val;
  };

  let currentTopKey = null;
  let currentListObj = null;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const fileLineNumber = idx + 2;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const isIndented = /^\s/.test(line);
    const isListItem = trimmed.startsWith('- ') || trimmed === '-';

    if (!isIndented && !isListItem) {
      const colonIdx = line.indexOf(':');
      if (colonIdx !== -1) {
        const key = line.slice(0, colonIdx).trim();
        const rawVal = line.slice(colonIdx + 1).trim();
        currentTopKey = key;
        currentListObj = null;
        keyLines[key] = fileLineNumber;

        if (rawVal === '') {
          data[key] = [];
        } else {
          data[key] = parseScalar(rawVal);
        }
      }
    } else if (currentTopKey) {
      if (isListItem) {
        if (!Array.isArray(data[currentTopKey])) {
          data[currentTopKey] = [];
        }
        const afterDash = trimmed.slice(1).trim();
        const colonIdx = afterDash.indexOf(':');
        if (
          colonIdx !== -1 &&
          !afterDash.startsWith('"') &&
          !afterDash.startsWith("'")
        ) {
          const subKey = afterDash.slice(0, colonIdx).trim();
          const subVal = parseScalar(afterDash.slice(colonIdx + 1));
          currentListObj = { [subKey]: subVal };
          data[currentTopKey].push(currentListObj);
        } else if (afterDash !== '') {
          currentListObj = null;
          data[currentTopKey].push(parseScalar(afterDash));
        } else {
          currentListObj = {};
          data[currentTopKey].push(currentListObj);
        }
      } else if (currentListObj && trimmed.includes(':')) {
        const colonIdx = trimmed.indexOf(':');
        const subKey = trimmed.slice(0, colonIdx).trim();
        const subVal = parseScalar(trimmed.slice(colonIdx + 1));
        currentListObj[subKey] = subVal;
      }
    }
  }

  return {
    hasFrontmatter: true,
    data,
    keyLines,
    bodyStartLine,
    content,
  };
};
