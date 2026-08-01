/**
 * Sanitize / Validate
 *
 * Small, dependency-free helpers used by the ingest + decision agents and by
 * server.js's input middleware. Centralized here so "what counts as clean input"
 * is defined once instead of re-implemented (and forgotten) in multiple places.
 */

// Escapes HTML-significant characters. Used any time user-supplied text is stored
// so that even if a rendering layer ever forgets to escape on output, stored data
// itself isn't a live payload. (Defense in depth - the frontend must ALSO escape
// on render. See dashboard db_script.js.)
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Strips control characters (except newline/tab) that have no business being in
// a complaint description and can be used for log injection / terminal tricks.
function stripControlChars(str) {
    return String(str).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

// Full name: letters, spaces, hyphens, apostrophes only. Bounded length.
const NAME_PATTERN = /^[a-zA-Z][a-zA-Z\s.'-]{1,79}$/;

// Roll number: alphanumeric (most Indian college roll numbers mix letters + digits),
// bounded length. Deliberately NOT digits-only like the original client-side regex,
// which would reject perfectly normal roll numbers while giving no real protection
// against a spoofed one anyway.
const ROLL_PATTERN = /^[a-zA-Z0-9\/-]{3,20}$/;

const MAX_CONTENT_LENGTH = 2000;
const MIN_CONTENT_LENGTH = 5;

function isValidName(name) {
    return typeof name === 'string' && NAME_PATTERN.test(name.trim());
}

function isValidRoll(roll) {
    return typeof roll === 'string' && ROLL_PATTERN.test(roll.trim());
}

// Rough gibberish / spam detector.
// The original implementation only caught strings like "aaaaa" (one character
// repeated). It let through "asdasdasd", "111111aaa", keyboard-mashing, etc.
// This version measures character diversity (unique chars / total chars) and
// flags low-diversity strings as likely spam, while still allowing short,
// legitimate, low-diversity phrases like "AC not working" (which has plenty
// of distinct characters) to pass.
function looksLikeSpam(content) {
    const trimmed = content.trim();
    if (trimmed.length < MIN_CONTENT_LENGTH) return true;

    const lower = trimmed.toLowerCase().replace(/\s/g, '');
    if (lower.length === 0) return true;

    const uniqueChars = new Set(lower).size;
    const diversity = uniqueChars / lower.length;

    // Low diversity over a reasonably long string = "aaaaaaaa", "hahahaha", etc.
    if (lower.length >= 8 && diversity <= 0.3) return true;

    // Single repeated character of any length (original check, kept as a fast path).
    if (/^([a-z0-9])\1+$/i.test(lower)) return true;

    // A short pattern (1-5 chars) repeated 3+ times back-to-back - catches
    // keyboard-mash spam like "asdasdasdasd" or "12341234123412" that has
    // enough raw character diversity to slip past the ratio check above.
    if (/^(.{1,5})\1{2,}$/i.test(lower)) return true;

    return false;
}

module.exports = {
    escapeHtml,
    stripControlChars,
    isValidName,
    isValidRoll,
    looksLikeSpam,
    MAX_CONTENT_LENGTH,
    MIN_CONTENT_LENGTH,
    NAME_PATTERN,
    ROLL_PATTERN
};
