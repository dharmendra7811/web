// Shared JSON parser that handles common LLM output issues:
// - Unescaped control characters in strings
// - Markdown fences
// - Trailing commas
function parseLLMJSON(raw) {
  // Strip markdown fences
  let text = raw.replace(/```json\s*|```/g, '').trim();

  // Extract JSON — find first { or [
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  const startIdx = Math.min(
    firstBrace === -1 ? Infinity : firstBrace,
    firstBracket === -1 ? Infinity : firstBracket,
  );
  if (startIdx !== Infinity && startIdx > 0) text = text.slice(startIdx);
  const lastBrace = text.lastIndexOf('}');
  const lastBracket = text.lastIndexOf(']');
  const endIdx = Math.max(lastBrace, lastBracket);
  if (endIdx !== -1 && endIdx < text.length - 1) text = text.slice(0, endIdx + 1);

  // Escape unescaped control characters inside JSON strings
  const sanitized = text.replace(/"([^"\\]|\\.)*"/g, (match) => {
    return match.replace(/[\x00-\x1f\x7f]/g, (ch) =>
      '\\u' + ('000' + ch.charCodeAt(0).toString(16)).slice(-4),
    );
  });

  try { return JSON.parse(sanitized); } catch (e1) {
    // Try with raw text
    try { return JSON.parse(text); } catch (e2) {
      // Try removing trailing commas (common LLM mistake)
      try { return JSON.parse(sanitized.replace(/,(\s*[}\]])/g, '$1')); } catch (e3) {
        throw new Error(`LLM returned invalid JSON: ${e1.message}`);
      }
    }
  }
}

module.exports = { parseLLMJSON };
