import * as katex from "katex";
import { renderMath, parseDelimiters, ParsedSegment, escapeRegex, replacePredefinedEscapeSequences, unescapeCharacters, revertEscapedCharacters, convertNewlinesToLatexBreaks } from "./index";

jest.mock("katex", () => ({
    renderToString: jest.fn((str, options) => {
        const displayClass = options?.displayMode ? "katex-display" : "";
        const classList = ["katex", displayClass].filter(Boolean).join(" ");

        if (str.includes("\\invalid")) {
            throw new Error("ParseError: KaTeX parse error: \\invalid command");
        }
        return `<span class="${classList}">${str}</span>`;
    }),
}));

const mockedKatex = katex as jest.Mocked<typeof katex>;

beforeEach(() => {
    mockedKatex.renderToString.mockClear();
});

describe("Helper Functions", () => {
    describe("escapeRegex", () => {
        it("should escape all special regex characters", () => {
            const input = ".*+?^${}()|[]\\";
            const expected = "\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\";
            expect(escapeRegex(input)).toBe(expected);
        });

        it("should return an empty string if given an empty string", () => {
            expect(escapeRegex("")).toBe("");
        });

        it("should not alter a string with no special characters", () => {
            const input = "abc123";
            expect(escapeRegex(input)).toBe(input);
        });
    });

    describe("Escape/Unescape Utilities", () => {
        const escapes = { "\\\\": "𜰀", "\\$": "𜰃" };
        const unEscapes = { "𜰀": "\\", "𜰃": "$" };
        const mathUnEscapes = { "𜰀": "\\\\", "𜰃": "$" };

        it("replacePredefinedEscapeSequences should replace a sequence with its placeholder", () => {
            const input = "This is a test with \\$ and another \\$";
            const expected = `This is a test with ${escapes["\\$"]} and another ${escapes["\\$"]}`;
            expect(replacePredefinedEscapeSequences(input, "\\$")).toBe(expected);
        });

        it("replacePredefinedEscapeSequences should throw an error for an undefined sequence", () => {
            const input = "Some text";
            const invalidSequence = "\\unknown"; // A sequence not in the `escapes` map.
            expect(() => replacePredefinedEscapeSequences(input, invalidSequence)).toThrow('Escape sequence "\\unknown" not found in escapes map.');
        });

        it("unescapeCharacters should revert placeholders to plain text characters", () => {
            const input = `This has a placeholder ${escapes["\\$"]} and a backslash ${escapes["\\\\"]}.`;
            const expected = `This has a placeholder $ and a backslash \\.`;
            expect(unescapeCharacters(input)).toBe(expected);
        });

        it("revertEscapedCharacters should revert placeholders to KaTeX-compatible sequences", () => {
            const input = `E=mc^2, price is ${escapes["\\$"]}5, path is C:${escapes["\\\\"]}Users`;
            const expected = `E=mc^2, price is $5, path is C:\\\\Users`;
            expect(revertEscapedCharacters(input)).toBe(expected);
        });

        it("should handle empty strings for all escape/unescape functions", () => {
            expect(replacePredefinedEscapeSequences("", "\\$")).toBe("");
            expect(unescapeCharacters("")).toBe("");
            expect(revertEscapedCharacters("")).toBe("");
        });

        it("should handle strings with no placeholders for unescape functions", () => {
            const input = "just plain text";
            expect(unescapeCharacters(input)).toBe(input);
            expect(revertEscapedCharacters(input)).toBe(input);
        });
    });

    describe("convertNewlinesToLatexBreaks", () => {
        it("should convert single newlines to LaTeX line breaks", () => {
            const input = "Line 1\nLine 2";
            const expected = "Line 1 \\\\\\\\ Line 2";
            expect(convertNewlinesToLatexBreaks(input)).toBe(expected);
        });

        it("should convert multiple newlines to multiple LaTeX line breaks", () => {
            const input = "Line 1\n\n\nLine 2";
            const expected = "Line 1 \\\\\\\\  \\\\\\\\  \\\\\\\\ Line 2";
            expect(convertNewlinesToLatexBreaks(input)).toBe(expected);
        });

        it("should handle empty strings", () => {
            expect(convertNewlinesToLatexBreaks("")).toBe("");
        });

        it("should handle strings with no newlines", () => {
            const input = "No newlines here";
            expect(convertNewlinesToLatexBreaks(input)).toBe(input);
        });

        it("should handle newlines at start and end", () => {
            const input = "\nStart\nEnd\n";
            const expected = " \\\\\\\\ Start \\\\\\\\ End \\\\\\\\ ";
            expect(convertNewlinesToLatexBreaks(input)).toBe(expected);
        });
    });
});

describe("parseDelimiters", () => {
    it("should return a single text segment for input with no delimiters", () => {
        const input = "Hello world, this is plain text.";
        const expected: ParsedSegment[] = [{ type: "text", display: false, content: input }];
        expect(parseDelimiters(input)).toEqual(expected);
    });

    it("should parse simple inline math with $...$", () => {
        const input = "An equation $E=mc^2$";
        const expected: ParsedSegment[] = [
            { type: "text", display: false, content: "An equation " },
            { type: "math", display: false, content: "E=mc^2" },
        ];
        expect(parseDelimiters(input)).toEqual(expected);
    });

    it("should parse simple display math with $$...$$", () => {
        const input = "The formula is $$a^2+b^2=c^2$$";
        const expected: ParsedSegment[] = [
            { type: "text", display: false, content: "The formula is " },
            { type: "math", display: true, content: "a^2+b^2=c^2" },
        ];
        expect(parseDelimiters(input)).toEqual(expected);
    });

    it("should parse parenthetical delimiters \\(...\\) and \\[...\\]", () => {
        const input = "Inline \\(x\\) and display \\[y\\]";
        const expected: ParsedSegment[] = [
            { type: "text", display: false, content: "Inline " },
            { type: "math", display: false, content: "x" },
            { type: "text", display: false, content: " and display " },
            { type: "math", display: true, content: "y" },
        ];
        expect(parseDelimiters(input)).toEqual(expected);
    });

    it("should handle text before, between, and after math segments", () => {
        const input = "First $a$, then $b$, and finally end.";
        const expected: ParsedSegment[] = [
            { type: "text", display: false, content: "First " },
            { type: "math", display: false, content: "a" },
            { type: "text", display: false, content: ", then " },
            { type: "math", display: false, content: "b" },
            { type: "text", display: false, content: ", and finally end." },
        ];
        expect(parseDelimiters(input)).toEqual(expected);
    });

    it("should handle an empty string as input", () => {
        expect(parseDelimiters("")).toEqual([]);
    });

    describe("Edge Cases and Complex Scenarios", () => {
        it("should prioritize longer delimiters like $$ over $ at the same position", () => {
            const input = "$$a+b$$";
            const expected: ParsedSegment[] = [{ type: "math", display: true, content: "a+b" }];
            expect(parseDelimiters(input)).toEqual(expected);
        });

        it("should not parse math inside an already matched block", () => {
            const input = "$$ a $b$ c $$";
            const expected: ParsedSegment[] = [{ type: "math", display: true, content: " a $b$ c " }];
            expect(parseDelimiters(input)).toEqual(expected);
        });

        it("should handle unclosed delimiters by treating them as text", () => {
            const input = "This is text with an unclosed $ delimiter";
            const expected: ParsedSegment[] = [{ type: "text", display: false, content: input }];
            expect(parseDelimiters(input)).toEqual(expected);
        });

        it("should handle mismatched delimiters by treating them as text", () => {
            const input = "This is text with mismatched \\( delimiters \\]";
            const expected: ParsedSegment[] = [{ type: "text", display: false, content: input }];
            expect(parseDelimiters(input)).toEqual(expected);
        });

        it("should handle adjacent math blocks correctly", () => {
            const input = "$a$$b$";
            const expected: ParsedSegment[] = [
                { type: "math", display: false, content: "a" },
                { type: "math", display: false, content: "b" },
            ];
            expect(parseDelimiters(input)).toEqual(expected);
        });

        it("should handle math at the start and end of the string", () => {
            const input = "$start$ middle $end$";
            const expected: ParsedSegment[] = [
                { type: "math", display: false, content: "start" },
                { type: "text", display: false, content: " middle " },
                { type: "math", display: false, content: "end" },
            ];
            expect(parseDelimiters(input)).toEqual(expected);
        });

        it("should handle empty math content", () => {
            const input = "An empty block: $$$$";
            const expected: ParsedSegment[] = [
                { type: "text", display: false, content: "An empty block: " },
                { type: "math", display: true, content: "" },
            ];
            expect(parseDelimiters(input)).toEqual(expected);
        });

        it("should treat escaped delimiter placeholders as text", () => {
            const placeholderForDollar = "𜰃"; // Represents `\$`
            const input = `Price is ${placeholderForDollar}5, not $math$`;
            const expected: ParsedSegment[] = [
                { type: "text", display: false, content: `Price is ${placeholderForDollar}5, not ` },
                { type: "math", display: false, content: "math" },
            ];
            expect(parseDelimiters(input)).toEqual(expected);
        });

        it("should correctly parse custom regex delimiters like \\begin{align}", () => {
            const alignBlock = "\\begin{align}x &= 1\\\\y &= 2\\end{align}";
            const input = `Equation: ${alignBlock}`;
            const expected: ParsedSegment[] = [
                { type: "text", display: false, content: "Equation: " },
                {
                    type: "math",
                    display: true,
                    content: alignBlock,
                },
            ];
            expect(parseDelimiters(input)).toEqual(expected);
        });
    });
});

describe("renderMath", () => {
    it("should render a simple string with inline math", () => {
        const input = "Let $x=5$.";
        const expected = 'Let <span class="katex">x=5</span>.';
        const result = renderMath(input);

        expect(result).toBe(expected);
        expect(mockedKatex.renderToString).toHaveBeenCalledTimes(1);
        expect(mockedKatex.renderToString).toHaveBeenCalledWith("x=5", expect.any(Object));
    });

    it("should render a simple string with display math", () => {
        const input = "The formula: $$E=mc^2$$";
        const expected = 'The formula: <span class="katex katex-display">E=mc^2</span>';
        const result = renderMath(input);

        expect(result).toBe(expected);
        expect(mockedKatex.renderToString).toHaveBeenCalledTimes(1);
        expect(mockedKatex.renderToString).toHaveBeenCalledWith("E=mc^2", expect.objectContaining({ displayMode: true }));
    });

    it("should treat escaped dollar signs (\\$) as literal text", () => {
        const input = "This costs \\$5.";
        const expected = "This costs $5.";
        const result = renderMath(input);

        expect(result).toBe(expected);
        expect(mockedKatex.renderToString).not.toHaveBeenCalled();
    });

    it("should correctly pass escaped backslashes (\\\\) to KaTeX for newlines", () => {
        const input = "A matrix $\\begin{pmatrix} a \\\\ b \\end{pmatrix}$";
        const expectedMathContent = "\\begin{pmatrix} a \\\\ b \\end{pmatrix}";
        const expectedOutput = `A matrix <span class="katex">${expectedMathContent}</span>`;

        const result = renderMath(input);
        expect(result).toBe(expectedOutput);
        expect(mockedKatex.renderToString).toHaveBeenCalledWith(expectedMathContent, expect.any(Object));
    });

    it("should correctly un-escape a double backslash in text parts", () => {
        const input = "A windows path: C:\\\\Users\\\\Test";
        const expected = "A windows path: C:\\Users\\Test";
        const result = renderMath(input);

        expect(result).toBe(expected);
        expect(mockedKatex.renderToString).not.toHaveBeenCalled();
    });

    describe("Integration and Advanced Scenarios", () => {
        it("should strip pre-existing placeholder characters from input before processing", () => {
            const placeholderForDollar = "𜰃";
            const input = `This should not be a price $5, but this is math $x=1$`;
            const maliciousInput = input.replace("$", placeholderForDollar);

            const expected = 'This should not be a price 5, but this is math <span class="katex">x=1</span>';
            const result = renderMath(maliciousInput);
            expect(result).toBe(expected);
        });

        it("should render a complex string with multiple delimiter types", () => {
            const alignContent = "\\begin{align*}E &= mc^2\\end{align*}";
            const input = `Inline \\(a\\), display \\[b\\], inline again $c$, display again $$d$$, and an environment: ${alignContent}. Final text.`;
            const expected = `Inline <span class="katex">a</span>, display <span class="katex katex-display">b</span>, inline again <span class="katex">c</span>, display again <span class="katex katex-display">d</span>, and an environment: <span class="katex katex-display">${alignContent}</span>. Final text.`;

            const result = renderMath(input);
            expect(result).toBe(expected);
            expect(mockedKatex.renderToString).toHaveBeenCalledTimes(5);
        });

        it("should correctly handle interaction between escaped chars and delimiters", () => {
            const input = "The price is \\$5, not $5$. A backslash \\\\ is not math.";
            const expected = 'The price is $5, not <span class="katex">5</span>. A backslash \\ is not math.';

            const result = renderMath(input);
            expect(result).toBe(expected);
            expect(mockedKatex.renderToString).toHaveBeenCalledTimes(1);
        });

        it("should render empty math blocks without crashing", () => {
            const input = "Empty inline: $ $, empty display: $$$$";
            const expected = 'Empty inline: <span class="katex"> </span>, empty display: <span class="katex katex-display"></span>';
            const result = renderMath(input);
            expect(result).toBe(expected);
        });

        it("should handle and reformat KaTeX parse errors", () => {
            const input = "This has an error: $a + \\invalid$";

            mockedKatex.renderToString.mockImplementation((str) => {
                if (str.includes("\\invalid")) {
                    return '<span class="katex-error" title="ParseError: KaTeX parse error: Unknown command \'\\invalid\'">Error</span>';
                }
                return str;
            });

            const result = renderMath(input);
            expect(result).toContain("title=\"LaTeX Error: Unknown command '\\invalid'\"");
            expect(result).toContain("This has an error: ");
        });

        it("should not reformat non-KaTeX parse errors", () => {
            const input = "An error: $a + b$";
            mockedKatex.renderToString.mockImplementation(() => {
                return '<span class="katex-error" title="SomeOtherError: A different issue">Error</span>';
            });

            const result = renderMath(input);
            expect(result).toContain('title="SomeOtherError: A different issue"');
        });
    });

    describe("Newline Handling", () => {
        beforeEach(() => {
            // Reset mock to default behavior for newline tests
            mockedKatex.renderToString.mockImplementation((str, options) => {
                const displayClass = options?.displayMode ? "katex-display" : "";
                const classList = ["katex", displayClass].filter(Boolean).join(" ");
                return `<span class="${classList}">${str}</span>`;
            });
        });

        it("should convert newlines to LaTeX line breaks in text segments", () => {
            const input = "First line\nSecond line\nThird line";
            const expected = "First line \\\\\\\\ Second line \\\\\\\\ Third line";
            const result = renderMath(input);
            expect(result).toBe(expected);
        });

        it("should convert newlines in text but preserve them in math", () => {
            const input = "Text line 1\nText line 2\n$\\begin{pmatrix} a \\\\ b \\end{pmatrix}$\nText line 3";
            const expected = "Text line 1 \\\\\\\\ Text line 2 \\\\\\\\ <span class=\"katex\">\\begin{pmatrix} a \\\\ b \\end{pmatrix}</span> \\\\\\\\ Text line 3";
            const result = renderMath(input);
            expect(result).toBe(expected);
        });

        it("should handle multiple consecutive newlines", () => {
            const input = "Line 1\n\n\nLine 2";
            const expected = "Line 1 \\\\\\\\  \\\\\\\\  \\\\\\\\ Line 2";
            const result = renderMath(input);
            expect(result).toBe(expected);
        });

        it("should handle newlines at start and end of text", () => {
            const input = "\nStart with newline\nEnd with newline\n";
            const expected = " \\\\\\\\ Start with newline \\\\\\\\ End with newline \\\\\\\\ ";
            const result = renderMath(input);
            expect(result).toBe(expected);
        });

        it("should not affect newlines inside LaTeX equations", () => {
            const input = "$\\begin{align}\na &= 1\\\\\nb &= 2\n\\end{align}$";
            const mathContent = "\\begin{align}\na &= 1\\\\\nb &= 2\n\\end{align}";
            const expected = `<span class="katex">${mathContent}</span>`;
            
            const result = renderMath(input);
            expect(result).toBe(expected);
            expect(mockedKatex.renderToString).toHaveBeenCalledWith(mathContent, expect.any(Object));
        });

        it("should handle mixed newlines and escaped characters", () => {
            const input = "Price: \\$5\nNext line\nMath: $x=1$\nFinal line";
            const expected = "Price: $5 \\\\\\\\ Next line \\\\\\\\ Math: <span class=\"katex\">x=1</span> \\\\\\\\ Final line";
            const result = renderMath(input);
            expect(result).toBe(expected);
        });
    });
});