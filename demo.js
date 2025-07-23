import { renderMath } from './dist/index.js';

// Test cases to demonstrate newline handling
const testCases = [
    {
        name: "Basic newline conversion",
        input: "First line\nSecond line\nThird line"
    },
    {
        name: "Newlines with math (should preserve newlines in math)",
        input: "Text line 1\nText line 2\n$\\begin{pmatrix} a \\\\ b \\end{pmatrix}$\nText line 3"
    },
    {
        name: "Multiple consecutive newlines",
        input: "Line 1\n\n\nLine 2"
    },
    {
        name: "Mixed content with escaped characters",
        input: "Price: \\$5\nNext line\nMath: $x=1$\nFinal line"
    },
    {
        name: "LaTeX equation with internal newlines (should be preserved)",
        input: "$$\\begin{align}\na &= 1\\\\\nb &= 2\n\\end{align}$$"
    }
];

console.log("=== Newline Handling Demo ===\n");

testCases.forEach((testCase, index) => {
    console.log(`${index + 1}. ${testCase.name}`);
    console.log(`Input: ${JSON.stringify(testCase.input)}`);
    console.log(`Output: ${JSON.stringify(renderMath(testCase.input))}`);
    console.log();
});