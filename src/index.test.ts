import * as katex from 'katex';
import {
    renderMath,
    parseDelimiters,
    ParsedSegment,
    escapeRegex,
    replacePredefinedEscapeSequences,
    unescapeCharacters,
    revertEscapedCharacters,
} from './index';

// Mock the katex library to control its behavior in tests.
jest.mock('katex', () => ({
    renderToString: jest.fn((str, options) => {
        // Simple mock: return the input string, noting if it's display mode.
        const displayClass = options?.displayMode ? 'katex-display' : '';
        // Simulate a KaTeX parse error for testing the error handling.
        if (str.includes('\\invalid')) {
            throw new Error('ParseError: KaTeX parse error: \\invalid command');
        }
        return `<span class="katex ${displayClass}">${str}</span>`;
    }),
}));

// Create a typed mock for easier use and type-safe assertions.
const mockedKatex = katex as jest.Mocked<typeof katex>;

// Clear mocks before each test to ensure a clean slate.
beforeEach(() => {
    mockedKatex.renderToString.mockClear();
});

describe('Helper Functions', () => {
    describe('escapeRegex', () => {
        it('should escape special regex characters', () => {
            const input = '.*+?^${}()|[]\\';
            const expected = '\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\';
            expect(escapeRegex(input)).toBe(expected);
        });
    });

    describe('Escape/Unescape Utilities', () => {
        // Placeholders are used to prevent `\$` and `\\` from being treated as delimiters.
        const escapes = { '\\\\': '𜰀', '\\$': '𜰃' };
        const unEscapes = { '𜰀': '\\', '𜰃': '$' };
        // For KaTeX, a literal backslash `\` must be escaped as `\\`.
        const mathUnEscapes = { '𜰀': '\\\\', '𜰃': '$' };

        it('replacePredefinedEscapeSequences should replace a sequence with its placeholder', () => {
            const input = 'This is a test with \\$ and another \\$';
            const expected = `This is a test with ${escapes['\\$']} and another ${escapes['\\$']}`;
            expect(replacePredefinedEscapeSequences(input, '\\$')).toBe(expected);
        });

        it('replacePredefinedEscapeSequences should throw an error for an undefined sequence', () => {
            const input = 'Some text';
            const invalidSequence = '\\unknown'; // A sequence not in the `escapes` map.
            expect(() => replacePredefinedEscapeSequences(input, invalidSequence)).toThrow(
                'Escape sequence "\\unknown" not found in escapes map.'
            );
        });

        it('unescapeCharacters should revert placeholders to plain text characters', () => {
            const input = `This has a placeholder ${escapes['\\$']} and a backslash ${escapes['\\\\']}.`;
            const expected = `This has a placeholder $ and a backslash \\.`;
            expect(unescapeCharacters(input)).toBe(expected);
        });

        it('revertEscapedCharacters should revert placeholders to KaTeX-compatible sequences', () => {
            const input = `E=mc^2, price is ${escapes['\\$']}5, path is C:${escapes['\\\\']}Users`;
            // Note the difference: `\\` becomes `\\\\` for KaTeX to render a literal backslash.
            const expected = `E=mc^2, price is $5, path is C:\\\\Users`;
            expect(revertEscapedCharacters(input)).toBe(expected);
        });
    });
});

describe('parseDelimiters', () => {
    it('should return a single text segment for input with no delimiters', () => {
        const input = 'Hello world, this is plain text.';
        const expected: ParsedSegment[] = [
            { type: 'text', display: false, content: input },
        ];
        expect(parseDelimiters(input)).toEqual(expected);
    });

    it('should parse simple inline math with $...$', () => {
        const input = 'An equation $E=mc^2$';
        const expected: ParsedSegment[] = [
            { type: 'text', display: false, content: 'An equation ' },
            { type: 'math', display: false, content: 'E=mc^2' },
        ];
        expect(parseDelimiters(input)).toEqual(expected);
    });

    it('should parse simple display math with $$...$$', () => {
        const input = 'The formula is $$a^2+b^2=c^2$$';
        const expected: ParsedSegment[] = [
            { type: 'text', display: false, content: 'The formula is ' },
            { type: 'math', display: true, content: 'a^2+b^2=c^2' },
        ];
        expect(parseDelimiters(input)).toEqual(expected);
    });

    it('should parse parenthetical delimiters \\(...\\) and \\[...\\]', () => {
        const input = 'Inline \\(x\\) and display \\[y\\]';
        const expected: ParsedSegment[] = [
            { type: 'text', display: false, content: 'Inline ' },
            { type: 'math', display: false, content: 'x' },
            { type: 'text', display: false, content: ' and display ' },
            { type: 'math', display: true, content: 'y' },
        ];
        expect(parseDelimiters(input)).toEqual(expected);
    });

    it('should handle text before, between, and after math segments', () => {
        const input = 'First $a$, then $b$, and finally end.';
        const expected: ParsedSegment[] = [
            { type: 'text', display: false, content: 'First ' },
            { type: 'math', display: false, content: 'a' },
            { type: 'text', display: false, content: ', then ' },
            { type: 'math', display: false, content: 'b' },
            { type: 'text', display: false, content: ', and finally end.' },
        ];
        expect(parseDelimiters(input)).toEqual(expected);
    });

    it('should prioritize longer delimiters like $$ over $', () => {
        const input = '$$a+b$$';
        const expected: ParsedSegment[] = [
            { type: 'math', display: true, content: 'a+b' },
        ];
        expect(parseDelimiters(input)).toEqual(expected);
    });

    it('should not parse math inside an already matched block', () => {
        // The inner `$b$` should be treated as part of the display math content.
        const input = '$$ a $b$ c $$';
        const expected: ParsedSegment[] = [
            { type: 'math', display: true, content: ' a $b$ c ' },
        ];
        expect(parseDelimiters(input)).toEqual(expected);
    });

    it('should parse custom regex delimiters like \\begin{align}', () => {
        const input = '\\begin{align}x &= 1\\\\y &= 2\\end{align}';
        const expected: ParsedSegment[] = [
            {
                type: 'math',
                display: true,
                // The custom regex is configured to match the entire block, including delimiters.
                content: '\\begin{align}x &= 1\\\\y &= 2\\end{align}',
            },
        ];
        expect(parseDelimiters(input)).toEqual(expected);
    });

    it('should treat escaped delimiter placeholders as text', () => {
        const placeholderForDollar = '𜰃'; // Represents `\$`
        const input = `Price is ${placeholderForDollar}5, not $math$`;
        const expected: ParsedSegment[] = [
            { type: 'text', display: false, content: `Price is ${placeholderForDollar}5, not ` },
            { type: 'math', display: false, content: 'math' },
        ];
        expect(parseDelimiters(input)).toEqual(expected);
    });

    it('should handle an empty string as input', () => {
        expect(parseDelimiters('')).toEqual([]);
    });
});

describe('renderMath', () => {
    it('should render a simple string with inline math', () => {
        const input = 'Let $x=5$.';
        const expected = 'Let <span class="katex ">x=5</span>.';
        const result = renderMath(input);

        expect(result).toBe(expected);
        expect(mockedKatex.renderToString).toHaveBeenCalledTimes(1);
        expect(mockedKatex.renderToString).toHaveBeenCalledWith('x=5', {
            displayMode: false,
            throwOnError: false,
            strict: false,
            trust: true,
        });
    });

    it('should render a simple string with display math', () => {
        const input = 'The formula: $$E=mc^2$$';
        const expected = 'The formula: <span class="katex katex-display">E=mc^2</span>';
        const result = renderMath(input);

        expect(result).toBe(expected);
        expect(mockedKatex.renderToString).toHaveBeenCalledTimes(1);
        expect(mockedKatex.renderToString).toHaveBeenCalledWith('E=mc^2', {
            displayMode: true,
            throwOnError: false,
            strict: false,
            trust: true,
        });
    });

    it('should treat escaped dollar signs (\\$) as literal text', () => {
        const input = 'This costs \\$5.';
        const expected = 'This costs $5.'; // No KaTeX rendering should occur.
        const result = renderMath(input);

        expect(result).toBe(expected);
        expect(mockedKatex.renderToString).not.toHaveBeenCalled();
    });

    it('should correctly pass escaped backslashes (\\\\) to KaTeX', () => {
        // To create a single literal backslash in a JS string, you type `\\`.
        // To create the string `\\`, which KaTeX needs for a newline, you must type `\\\\`.
        const input = 'A matrix $\\begin{pmatrix} a \\\\ b \\end{pmatrix}$';
        const expectedMathContent = '\\begin{pmatrix} a \\\\ b \\end{pmatrix}';
        const expectedOutput = `A matrix <span class="katex ">${expectedMathContent}</span>`;

        const result = renderMath(input);
        expect(result).toBe(expectedOutput);
        expect(mockedKatex.renderToString).toHaveBeenCalledWith(expectedMathContent, expect.any(Object));
    });

    it('should render content with custom delimiters like \\begin{align*}', () => {
        const alignContent = '\\begin{align*}E &= mc^2\\end{align*}';
        const input = `Aligned equation: ${alignContent}`;
        const expectedOutput = `Aligned equation: <span class="katex katex-display">${alignContent}</span>`;

        const result = renderMath(input);
        expect(result).toBe(expectedOutput);
        expect(mockedKatex.renderToString).toHaveBeenCalledWith(alignContent, expect.objectContaining({ displayMode: true }));
    });

    it('should handle and reformat KaTeX parse errors', () => {
        const input = 'This has an error: $a + \\invalid$';

        // Configure the mock to throw an error that our main function will catch and reformat.
        mockedKatex.renderToString.mockImplementation((str) => {
            if (str.includes('\\invalid')) {
                // This simulates the structure of the error message KaTeX produces.
                return '<span class="katex-error" title="ParseError: KaTeX parse error: something">Error</span>';
            }
            return str;
        });

        const result = renderMath(input);

        // Check that the error title was replaced with the user-friendly version.
        expect(result).toContain('title="LaTeX Error: something"');
        expect(result).toContain('This has an error: ');
    });
});