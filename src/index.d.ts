/**
 * Parses and renders LaTeX content in a string using KaTeX.
 *
 * @param {string} input - The input string containing LaTeX content.
 * @returns {string} The rendered output with LaTeX content replaced by their corresponding HTML representation.
 */
declare const renderMath: (input: string) => string;
export { renderMath };