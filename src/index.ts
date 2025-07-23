import * as katex from 'katex';

interface Delimiter {
    start: string;
    end: string;
    type: 'display' | 'inline';
    customRegex?: RegExp;
    compiledRegex?: RegExp;
}

interface ParsedSegment {
    type: 'text' | 'math';
    display: boolean;
    content: string;
}

interface Match {
    display: boolean;
    content: string;
    start: number;
    end: number;
}

const BACKSLASH_PLACEHOLDER = '𜰀'; // Placeholder for a literal backslash
const DOLLAR_PLACEHOLDER = '𜰃';   // Placeholder for a literal dollar sign

/**
 * Escapes characters that have special meaning in regular expressions.
 * Use this function to match a literal string that might contain characters
 * like `.` `*` `+` `?` `^` `$` `{` `}` `(` `)` `|` `[` `]` `\`.
 * @param string - The string to escape.
 * @returns The string with special regex characters escaped.
 */
const escapeRegex = (string: string): string => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const delimiters: Delimiter[] = [
    { start: '$$', end: '$$', type: 'display' },
    { start: '$', end: '$', type: 'inline' },
    { start: String.raw`\[`, end: String.raw`\]`, type: 'display' },
    { start: String.raw`\(`, end: String.raw`\)`, type: 'inline' },
    {
        start: String.raw`\begin{align*}`,
        end: String.raw`\end{align*}`,
        type: 'display',
        customRegex: /(?:\\begin{align\*})([\s\S]*?)(?:\\end{align\*})/g,
    },
    {
        start: String.raw`\begin{align}`,
        end: String.raw`\end{align}`,
        type: 'display',
        customRegex: /(?:\\begin{align})([\s\S]*?)(?:\\end{align})/g,
    },
].map(d => ({
    ...d,
    type: d.type as 'display' | 'inline',
    // Pre-compile regex for efficiency
    compiledRegex: d.customRegex
        ? new RegExp(d.customRegex.source, 'g')
        : new RegExp(
              String.raw`(?:${escapeRegex(d.start)})([\s\S]*?)(?:${escapeRegex(d.end)})`,
              'g'
          ),
}));


/**
 * The escaping mechanism relies on replacing specific sequences (like `\$` or `\\`)
 * with temporary, private-use Unicode characters. This prevents the parser from
 * misinterpreting them as math delimiters. These characters are then converted
 * back to their original form after parsing is complete.
 */

// Maps sequences to escape to a temporary placeholder character.
const escapes: Record<string, string> = {
    '\\\\': BACKSLASH_PLACEHOLDER,
    '\\$': DOLLAR_PLACEHOLDER,
};

// Reverses the `escapes` mapping for plain text segments.
const unEscapes: Record<string, string> = {
    [BACKSLASH_PLACEHOLDER]: '\\',
    [DOLLAR_PLACEHOLDER]: '$',
};

// Reverses the `escapes` mapping for math segments.
// A literal backslash in LaTeX is `\\`, so we map the placeholder to `\\\\`.
const mathUnEscapes: Record<string, string> = {
    [BACKSLASH_PLACEHOLDER]: '\\\\',
    [DOLLAR_PLACEHOLDER]: '$',
};

// Helper arrays derived from the escape maps.
const escapedSequences: string[] = Object.values(escapes);
const escapeSequences: string[] = Object.keys(escapes);

// Pre-compile a single regex for efficient unescaping in text and math
const unescapeAllPlaceholdersRegex = new RegExp(`(${escapedSequences.map(s => escapeRegex(s)).join('|')})`, 'g');


/**
 * Replaces a predefined escape sequence (e.g., `\$`) with its corresponding
 * internal Unicode placeholder. This is crucial to prevent these sequences
 * from being misinterpreted as math delimiters.
 * @param input - The string to process.
 * @param sequenceToReplace - The specific escape sequence (e.g., `\$`, `\\`) to replace.
 * @returns The input string with the sequence replaced by its placeholder.
 * @throws If `sequenceToReplace` is not a defined key in the `escapes` map.
 */
const replacePredefinedEscapeSequences = (input: string, sequenceToReplace: string): string => {
    const replacement = escapes[sequenceToReplace];
    if (replacement === undefined) {
        throw new Error(`Escape sequence "${sequenceToReplace}" not found in escapes map.`);
    }
    return input.replaceAll(sequenceToReplace, replacement);
};

/**
 * Unescapes characters in non-math text content by reverting internal placeholders
 * (e.g., `DOLLAR_PLACEHOLDER`) back to their original representations (e.g., `$`).
 * @param input - The string to unescape.
 * @returns The unescaped string.
 */
const unescapeCharacters = (input: string): string => {
    return input.replace(unescapeAllPlaceholdersRegex, (match: string) => unEscapes[match]);
};

/**
 * Reverts internal placeholders in math content back to their KaTeX-compatible
 * LaTeX representations. For instance, `BACKSLASH_PLACEHOLDER` becomes `\\\\` for KaTeX to correctly
 * render a literal backslash within a formula.
 * @param input - The string containing placeholders to revert.
 * @returns The reverted string, ready for KaTeX rendering.
 */
const revertEscapedCharacters = (input: string): string => {
    // Optimized: Use a single replace with a replacer function
    return input.replace(unescapeAllPlaceholdersRegex, (match: string) => mathUnEscapes[match]);
};

/**
 * Converts newlines in text content to LaTeX line breaks.
 * This function replaces `\n` with ` \\\\ ` which represents a line break in LaTeX.
 * @param input - The text content to process.
 * @returns The text with newlines converted to LaTeX line breaks.
 */
const convertNewlinesToLatexBreaks = (input: string): string => {
    return input.replace(/\n/g, ' \\\\\\\\ ');
};

/**
 * Parses an input string to find and extract content enclosed within delimiters.
 * It segments the input into an array of objects, distinguishing between regular
 * text and math content. The logic collects all potential matches, sorts them to
 * prioritize longer matches at the same start position, and then filters to
 * ensure there are no overlapping segments.
 *
 * @param input - The raw input string, potentially containing text and delimited math.
 * @returns An array of `ParsedSegment` objects representing the parsed segments.
 */
const parseDelimiters = (input: string): ParsedSegment[] => {
    const allRawMatches: Match[] = [];

    // Step 1: Find all possible matches for all defined delimiters.
    delimiters.forEach((delimiter: Delimiter) => {
        // Use the pre-compiled regex
        const delimiterRegex = delimiter.compiledRegex!;
        delimiterRegex.lastIndex = 0;

        let match: RegExpExecArray | null;
        while ((match = delimiterRegex.exec(input)) !== null) {
            const startIndex = match.index;
            const fullMatchContent = match[0];
            const contentToExtract = delimiter.customRegex ? fullMatchContent : match[1];
            const endIndex = startIndex + fullMatchContent.length;

            allRawMatches.push({
                display: delimiter.type === 'display',
                content: contentToExtract,
                start: startIndex,
                end: endIndex,
            });
        }
    });

    // Step 2: Sort all matches.
    // Primary sort: by start index (ascending).
    // Secondary sort: by length of the match (descending) to prioritize longer delimiters (e.g., `$$` over `$`).
    allRawMatches.sort((a, b) => {
        if (a.start !== b.start) {
            return a.start - b.start;
        }
        return b.end - b.start - (a.end - a.start);
    });

    // Step 3: Filter for non-overlapping matches.
    const finalMatches: Match[] = [];
    let lastProcessedEndIndex = 0; // Tracks the end position of the last accepted match.

    for (const currentMatch of allRawMatches) {
        // Accept the match only if it starts at or after the end of the last accepted one.
        // This ensures no overlaps and that the first valid match at a position wins.
        if (currentMatch.start >= lastProcessedEndIndex) {
            finalMatches.push(currentMatch);
            lastProcessedEndIndex = currentMatch.end;
        }
    }

    // Step 4: Generate the final array of text and math segments.
    const output: ParsedSegment[] = [];
    let previousIndex = 0; // Tracks the end of the last processed segment.

    finalMatches.forEach((match: Match) => {
        // Add the text segment before the current math match, if any.
        if (previousIndex < match.start) {
            output.push({
                type: 'text',
                display: false,
                content: input.substring(previousIndex, match.start),
            });
        }
        // Add the math segment.
        output.push({
            type: 'math',
            display: match.display,
            content: match.content,
        });
        previousIndex = match.end;
    });

    // Add any remaining text after the last math segment.
    if (previousIndex < input.length) {
        output.push({
            type: 'text',
            display: false,
            content: input.substring(previousIndex, input.length),
        });
    }

    return output;
};

/**
 * Parses and renders LaTeX content in a string using KaTeX.
 * @param input - The input string containing LaTeX content.
 * @returns The rendered output with LaTeX content replaced by its HTML representation.
 */
const renderMath = (input: string): string => {
    // Before processing, strip any pre-existing placeholder characters from the raw
    // input. This prevents them from being misinterpreted by the un-escaping logic.
    const regexToClean = new RegExp(escapedSequences.map(s => escapeRegex(s)).join('|'), 'g');
    let cleanedInput = input.replaceAll(regexToClean, '');

    // Step 1: Replace escaped sequences like `\$` with placeholder characters.
    let escapedInput = cleanedInput;
    escapeSequences.forEach((sequenceToEscape: string) => {
        escapedInput = replacePredefinedEscapeSequences(escapedInput, sequenceToEscape);
    });

    // Step 2: Parse the string into text and math segments.
    const parsedInput: ParsedSegment[] = parseDelimiters(escapedInput);

    // Step 3: Render each segment, un-escaping characters as needed.
    let renderedOutput = '';
    parsedInput.forEach((match: ParsedSegment) => {
        if (match.type == 'text') {
            // Convert newlines to LaTeX line breaks in text segments
            const textWithLineBreaks = convertNewlinesToLatexBreaks(match.content);
            renderedOutput += unescapeCharacters(textWithLineBreaks);
        } else if (match.type == 'math') {
            renderedOutput += katex
                .renderToString(revertEscapedCharacters(match.content), {
                    displayMode: match.display,
                    throwOnError: false,
                    strict: false,
                    trust: true,
                })
                // Improve the KaTeX error message for better user feedback.
                .replace(
                    /(?<=<span[^>]*?\s+class="katex-error"[^>]*?\s+title=")(ParseError: KaTeX parse error:)(?=[^"]*"[^>]*?>)/g,
                    'LaTeX Error:'
                );
        }
    });
    return renderedOutput;
};

export {
    renderMath,
    // Export helpers for testing
    escapeRegex,
    replacePredefinedEscapeSequences,
    unescapeCharacters,
    revertEscapedCharacters,
    parseDelimiters,
    convertNewlinesToLatexBreaks,
    // Export types for use in tests
    ParsedSegment,
    Delimiter,
};
