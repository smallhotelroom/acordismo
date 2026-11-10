/**
 * @file src/components/songSheetRenderer.jsx
 * @version 1.1.0
 * Renders song sheet lines (curated `(...)` chord groups, standalone/crawler chord lines,
 * `[choir]` backing vocal blocks, and top capo/drop/tuning directives) into React elements.
 */
import React from 'react';
import {
    CHORD_GROUP_DELIMITER_REGEX,
    DIRECTIVE_PAREN_REGEX,
    isValidParenChordGroup,
    parseChordToken,
    transposeChordToken,
} from '../shared/chordTransposer.js';
import {
    isCrawlerChordLine,
    isStandaloneChordLine,
    stripOuterPunctuation,
} from '../shared/crawlerTransposer';

export const __version__ = '1.1.0';

export function renderLyricWithChoir(text, choirColor, baseKey) {
    if (!text || !text.includes('[')) {
        return <span key={baseKey}>{text}</span>;
    }
    const parts = [];
    const regex = /\[[^\]]+\]/g;
    let lastIdx = 0;
    let match;
    let subIdx = 0;
    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIdx) {
            parts.push(
                <span key={`${baseKey}-t-${subIdx++}`}>
                    {text.slice(lastIdx, match.index)}
                </span>
            );
        }
        parts.push(
            <em
                key={`${baseKey}-c-${subIdx++}`}
                style={{ color: choirColor, fontStyle: 'italic' }}>
                {match[0]}
            </em>
        );
        lastIdx = match.index + match[0].length;
    }
    if (lastIdx < text.length) {
        parts.push(<span key={`${baseKey}-t-${subIdx++}`}>{text.slice(lastIdx)}</span>);
    }
    return <span key={baseKey}>{parts}</span>;
}

export function renderCrawlerChordLineNodes(
    lineText,
    visualOffset,
    useFlats,
    palette,
    startKey,
    onChordClick
) {
    const nodes = [];
    let keyCounter = startKey;
    const tokenRegex = /(\S+)|(\s+)/g;
    let match;

    while ((match = tokenRegex.exec(lineText)) !== null) {
        const [, rawWord, spaceRun] = match;
        if (spaceRun) {
            nodes.push(<span key={keyCounter++}>{spaceRun}</span>);
        } else if (rawWord) {
            const { prefix, core, suffix } = stripOuterPunctuation(rawWord);
            if (core && parseChordToken(core) !== null) {
                if (prefix) {
                    nodes.push(<span key={keyCounter++}>{prefix}</span>);
                }
                const transposedChord = transposeChordToken(
                    core,
                    visualOffset,
                    useFlats
                );
                nodes.push(
                    <strong
                        key={keyCounter++}
                        style={{
                            color: palette.chord,
                            cursor: onChordClick ? 'pointer' : 'inherit',
                        }}
                        onClick={
                            onChordClick
                                ? (e) => {
                                      e.stopPropagation();
                                      onChordClick(transposedChord);
                                  }
                                : undefined
                        }>
                        {transposedChord}
                    </strong>
                );
                if (suffix) {
                    nodes.push(<span key={keyCounter++}>{suffix}</span>);
                }
            } else {
                nodes.push(<span key={keyCounter++}>{rawWord}</span>);
            }
        }
    }

    return { nodes, nextKey: keyCounter };
}

export function buildSongSheetElements({
    songData,
    displayedLyrics,
    isTranslationView = false,
    songCapo = 0,
    compensateCapo = false,
    fakeUkeEnabled = false,
    parsedTuning = null,
    visualOffset = 0,
    songUseFlats = false,
    freezeChordsEnabled = true,
    onChordTap = null,
    sheetBgColor = 'var(--bg-primary)',
    palette,
}) {
    if (!songData) {
        return [];
    }

    const preChordItems = [];
    const sections = [];
    let currentSection = null;

    if (!isTranslationView) {
        const topDirectives = [];
        if (songCapo !== 0) {
            const origCapoDesc =
                songCapo < 0
                    ? `drop ${-songCapo} semitones`
                    : `capo on ${songCapo}`;
            if (fakeUkeEnabled) {
                topDirectives.push(
                    `(guitar shapes for ukulele [-5]; compensated for ${origCapoDesc})`
                );
            } else if (compensateCapo) {
                topDirectives.push(
                    `(chords compensated for no ${songCapo < 0 ? 'drop' : 'capo'}; originally ${origCapoDesc})`
                );
            } else {
                topDirectives.push(`(chords for ${origCapoDesc})`);
            }
        } else if (fakeUkeEnabled) {
            topDirectives.push(`(guitar shapes for ukulele [-5 semitones])`);
        }

        if (parsedTuning) {
            if (compensateCapo || fakeUkeEnabled) {
                topDirectives.push(
                    `(diagrams reverted to standard postures; originally tuning: ${parsedTuning.displayStr})`
                );
            } else {
                topDirectives.push(`(tuning: ${parsedTuning.displayStr})`);
            }
        }

        if (topDirectives.length > 0) {
            preChordItems.push(
                <strong key="top-directives" style={{ color: palette.directive }}>
                    {topDirectives.join('\n')}
                    {'\n\n'}
                </strong>
            );
        }
    }

    const isCrawlerOrigin = Number(songData.origin_id || 0) > 0;
    const lines = String(displayedLyrics || '').split('\n');
    let counter = 0;

    lines.forEach((lineText, lineIndex) => {
        const lineNodes = [];
        let hasChordsOnLine = false;

        if (isCrawlerOrigin) {
            if (isCrawlerChordLine(lineText)) {
                hasChordsOnLine = true;
                const { nodes, nextKey } = renderCrawlerChordLineNodes(
                    lineText,
                    visualOffset,
                    songUseFlats,
                    palette,
                    counter,
                    onChordTap
                );
                lineNodes.push(...nodes);
                counter = nextKey;
            } else {
                lineNodes.push(
                    renderLyricWithChoir(lineText, palette.choir, counter++)
                );
            }
        } else if (!lineText.includes('(') && isStandaloneChordLine(lineText)) {
            hasChordsOnLine = true;
            const { nodes, nextKey } = renderCrawlerChordLineNodes(
                lineText,
                visualOffset,
                songUseFlats,
                palette,
                counter,
                onChordTap
            );
            lineNodes.push(...nodes);
            counter = nextKey;
        } else {
            const re1 = /\((.+?)\)/g;
            let array1;
            let outerLastIndex = 0;

            while ((array1 = re1.exec(lineText)) !== null) {
                const chordGroup = array1[1];
                const isDirectiveGroup = DIRECTIVE_PAREN_REGEX.test(chordGroup);
                const isValidChords =
                    !isDirectiveGroup && isValidParenChordGroup(chordGroup);

                if (!isDirectiveGroup && !isValidChords) {
                    continue;
                }

                lineNodes.push(
                    renderLyricWithChoir(
                        lineText.slice(
                            outerLastIndex,
                            re1.lastIndex - array1[0].length
                        ),
                        palette.choir,
                        counter
                    )
                );

                if (isDirectiveGroup) {
                    lineNodes.push(
                        <strong key={counter + 1} style={{ color: palette.directive }}>
                            ({chordGroup})
                        </strong>
                    );
                } else {
                    hasChordsOnLine = true;
                    let remaining = chordGroup;
                    let innerDone = false;
                    const innerTokens = [];
                    let tokIdx = 0;

                    while (innerDone === false) {
                        const delimiter = CHORD_GROUP_DELIMITER_REGEX.exec(remaining);
                        if (delimiter !== null) {
                            const treatable = remaining.slice(0, delimiter.index);
                            const delimStr = delimiter[0];
                            remaining = remaining.slice(
                                delimiter.index + delimStr.length,
                                remaining.length
                            );
                            if (delimiter.index === 0) {
                                innerTokens.push(
                                    <span
                                        key={`mod-${tokIdx++}`}
                                        style={{ color: palette.modifier }}>
                                        {delimStr}
                                    </span>
                                );
                                continue;
                            }
                            const transposedToken = transposeChordToken(
                                treatable,
                                visualOffset,
                                songUseFlats
                            );
                            innerTokens.push(
                                <span
                                    key={`ch-${tokIdx++}`}
                                    style={{
                                        color: palette.chord,
                                        cursor: onChordTap ? 'pointer' : 'inherit',
                                    }}
                                    onClick={
                                        onChordTap
                                            ? (e) => {
                                                  e.stopPropagation();
                                                  onChordTap(transposedToken);
                                              }
                                            : undefined
                                    }>
                                    {transposedToken}
                                </span>
                            );
                            innerTokens.push(
                                <span
                                    key={`mod-${tokIdx++}`}
                                    style={{ color: palette.modifier }}>
                                    {delimStr}
                                </span>
                            );
                            continue;
                        }
                        if (remaining.length > 0) {
                            const transposedToken = transposeChordToken(
                                remaining,
                                visualOffset,
                                songUseFlats
                            );
                            innerTokens.push(
                                <span
                                    key={`ch-${tokIdx++}`}
                                    style={{
                                        color: palette.chord,
                                        cursor: onChordTap ? 'pointer' : 'inherit',
                                    }}
                                    onClick={
                                        onChordTap
                                            ? (e) => {
                                                  e.stopPropagation();
                                                  onChordTap(transposedToken);
                                              }
                                            : undefined
                                    }>
                                    {transposedToken}
                                </span>
                            );
                        }
                        innerDone = true;
                    }

                    lineNodes.push(
                        <strong key={counter + 1}>
                            <span style={{ color: palette.parenSymbol }}>(</span>
                            {innerTokens}
                            <span style={{ color: palette.parenSymbol }}>)</span>
                        </strong>
                    );
                }

                counter = counter + 2;
                outerLastIndex = re1.lastIndex;
            }

            lineNodes.push(
                renderLyricWithChoir(
                    lineText.slice(outerLastIndex, lineText.length),
                    palette.choir,
                    counter
                )
            );
            counter += 1;
        }

        const isLastLine = lineIndex === lines.length - 1;
        if (hasChordsOnLine) {
            const chordLineEl = (
                <div
                    key={`line-${lineIndex}`}
                    style={
                        freezeChordsEnabled
                            ? {
                                  position: 'sticky',
                                  top: 15,
                                  zIndex: 10 + lineIndex,
                                  backgroundColor: sheetBgColor,
                                  margin: '0 -15px',
                                  padding: '0 15px',
                              }
                            : undefined
                    }>
                    {lineNodes}
                </div>
            );
            currentSection = {
                key: `sec-${lineIndex}`,
                items: [chordLineEl],
            };
            sections.push(currentSection);
        } else {
            const lyricLineEl = (
                <span key={`line-${lineIndex}`}>
                    {lineNodes}
                    {!isLastLine ? '\n' : ''}
                </span>
            );
            if (currentSection) {
                currentSection.items.push(lyricLineEl);
            } else {
                preChordItems.push(lyricLineEl);
            }
        }
    });

    return [
        ...preChordItems,
        ...sections.map((sec) => <div key={sec.key}>{sec.items}</div>),
    ];
}
