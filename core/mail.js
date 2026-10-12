import he from "he";

/*
 * Engine independent helpers for the mail steps backed by the Mailpit REST API
 * (https://mailpit.axllent.org/docs/api-v1/).
 *
 * The raw SMTP payload is handled as a "binary" string (one char per raw byte),
 * so it can be validated byte by byte.
 */

export const MAIL_POLL_ATTEMPTS = 15;
export const MAIL_POLL_INTERVAL_MS = 1000;

// Latin-1/cp1252 mis-decode of UTF-8 bytes: "é" (C3 A9) -> "Ã©", "à" (C3 A0) -> "Ã ",
// nbsp (C2 A0) -> "Â ", "ř" (C5 99) -> "Å\u0099"... A lead char in [ÂÃÄÅ] followed
// by a Latin-1 continuation-range char or a cp1252 punctuation char never occurs in
// legitimate French text.
export const MOJIBAKE = /[ÂÃÄÅ][\u0080-¿ŒœŠšŸŽžƒˆ˜–—‘-„†-•…‰‹›€™]/;
// C1 control characters: a raw byte decoded as Latin-1 instead of UTF-8.
export const C1_CONTROLS = /[\u0080-\u009F]/;
export const REPLACEMENT_CHAR = /�/;
// An HTML entity that should have been decoded before reaching a plain-text field.
export const HTML_ENTITY = /&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i;
// An entity escaped twice ("&amp;eacute;", "&amp;nbsp;") renders literally in the HTML part.
export const DOUBLE_ESCAPED_ENTITY = /&amp;(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i;
// RFC 2047 encoded-word (the only valid way to carry non-ASCII in a header).
export const ENCODED_WORD = /=\?([^?]+)\?[BQ]\?[^?]*\?=/i;

export function searchQuery(recipient, subject) {
    return subject ? `to:"${recipient}" subject:"${subject}"` : `to:"${recipient}"`;
}

// Mailpit "to:" search is a substring match ("jane@x.fr" also matches "mary-jane@x.fr"),
// so results are narrowed down to the exact recipient. Messages come newest first.
export function filterRecipient(messages, recipient) {
    return messages.filter((message) =>
        message.To.some((to) => to.Address.toLowerCase() === recipient.toLowerCase())
    );
}

export function noMailError(recipient, subject) {
    return new Error(`No mail sent to ${recipient}${subject ? ` with subject "${subject}"` : ''} found in Mailpit after ${MAIL_POLL_ATTEMPTS} attempts`);
}

export function binaryStringToBytes(binary) {
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function rawHeaderBlock(raw) {
    const end = raw.search(/\r?\n\r?\n/);
    return end === -1 ? raw : raw.slice(0, end);
}

export function rawHeader(headerBlock, name) {
    // Unfold continuation lines before matching (RFC 5322 §2.2.3).
    const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, ' ');
    const match = unfolded.match(new RegExp(`^${name}:\\s*(.*)$`, 'im'));
    return match ? match[1] : null;
}

// Visible text of the HTML part: tags dropped, entities decoded, whitespace collapsed.
export function htmlToText(html) {
    return he.decode((html || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ');
}

export function extractLinks(html) {
    return [...(html || '').matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => he.decode(m[1]));
}
