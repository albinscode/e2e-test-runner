const { expect } = require('@playwright/test');
const he = require('he');
const { Given, Then, When } = require('../fixtures');
const { render } = require('../../../core/utils');
const {
    C1_CONTROLS,
    DOUBLE_ESCAPED_ENTITY,
    ENCODED_WORD,
    HTML_ENTITY,
    MAIL_POLL_ATTEMPTS,
    MAIL_POLL_INTERVAL_MS,
    MOJIBAKE,
    REPLACEMENT_CHAR,
    binaryStringToBytes,
    extractLinks,
    filterRecipient,
    htmlToText,
    noMailError,
    rawHeader,
    rawHeaderBlock,
    searchQuery,
} = require('../../../core/mail');

/*
 * Mail steps backed by the Mailpit REST API (https://mailpit.axllent.org/docs/api-v1/).
 *
 * The last fetched mail is stored in the context as `mail` (like `response` for HTTP):
 *   {{ mail.Subject }}, {{ mail.Text }}, {{ mail.HTML }}, {{ mail.To[0].Address }}...
 */

function mailpitUrl(world) {
    expect(world.mailpitUrl, 'Mailpit url (use step: I setup mailpit with url "...")').toBeTruthy();
    return world.mailpitUrl;
}

async function searchMails(request, world, recipient, subject) {
    const response = await request.get(`${mailpitUrl(world)}/api/v1/search`, {
        params: { query: searchQuery(recipient, subject), limit: 200 },
    });

    expect(response.ok(), `Mailpit search: ${response.status()}`).toBe(true);

    return filterRecipient((await response.json()).messages, recipient);
}

async function waitForMail(request, world, recipient, subject) {
    for (let attempt = 1; attempt <= MAIL_POLL_ATTEMPTS; attempt += 1) {
        const messages = await searchMails(request, world, recipient, subject);

        if (messages.length > 0) {
            return messages[0];
        }
        if (attempt < MAIL_POLL_ATTEMPTS) {
            await new Promise((resolve) => setTimeout(resolve, MAIL_POLL_INTERVAL_MS));
        }
    }

    throw noMailError(recipient, subject);
}

async function fetchLastMail(request, world, templatedRecipient, templatedSubject) {
    const recipient = render(templatedRecipient, world);
    const subject = templatedSubject && render(templatedSubject, world);
    const summary = await waitForMail(request, world, recipient, subject);
    const base = `${mailpitUrl(world)}/api/v1/message/${summary.ID}`;
    const message = await (await request.get(base)).json();
    // "latin1" keeps one char per raw byte, like the Cypress "binary" encoding.
    const raw = (await (await request.get(`${base}/raw`)).body()).toString('latin1');

    world.mail = { ...message, raw };
}

function expectCleanText(label, value) {
    const text = value || '';

    expect(REPLACEMENT_CHAR.test(text), `${label} contains U+FFFD (invalid UTF-8 bytes): ${text}`).toBe(false);
    expect(MOJIBAKE.test(text), `${label} contains mojibake (UTF-8 read as Latin-1): ${text.match(MOJIBAKE)?.[0]}`).toBe(false);
    expect(C1_CONTROLS.test(text), `${label} contains C1 control characters (UTF-8 read as Latin-1)`).toBe(false);
}

Given('I setup mailpit with url {string}', async ({ world }, templatedUrl) => {
    world.mailpitUrl = render(templatedUrl, world).replace(/\/+$/, '');
});

Given('I delete all mails sent to {string}', async ({ request, world }, templatedRecipient) => {
    const messages = await searchMails(request, world, render(templatedRecipient, world));

    if (messages.length > 0) {
        await request.delete(`${mailpitUrl(world)}/api/v1/messages`, {
            data: { IDs: messages.map((message) => message.ID) },
        });
    }
});

When('I get the last mail sent to {string}', async ({ request, world }, templatedRecipient) => {
    await fetchLastMail(request, world, templatedRecipient);
});

When('I get the last mail sent to {string} with subject {string}', async ({ request, world }, templatedRecipient, templatedSubject) => {
    await fetchLastMail(request, world, templatedRecipient, templatedSubject);
});

Then('I expect {int} mail(s) sent to {string}', async ({ request, world }, expected, templatedRecipient) => {
    const recipient = render(templatedRecipient, world);
    const messages = await searchMails(request, world, recipient);

    expect(messages.length, `mails sent to ${recipient}`).toBe(expected);
});

Then('I expect the mail subject is {string}', async ({ world }, templatedExpected) => {
    expect(world.mail.Subject).toBe(render(templatedExpected, world));
});

// Checks the text is present, correctly decoded, in both the text/plain and text/html parts.
Then('I expect the mail contains {string}', async ({ world }, templatedExpected) => {
    const expected = render(templatedExpected, world);

    expect(world.mail.Text.replace(/\s+/g, ' '), 'text/plain part').toContain(expected);
    expect(htmlToText(world.mail.HTML), 'text/html part').toContain(expected);
});

Then('I store the mail link containing {string} as {string} in context', async ({ world }, templatedPart, key) => {
    const part = render(templatedPart, world);
    const link = extractLinks(world.mail.HTML).find((href) => href.includes(part));

    expect(link, `link containing "${part}" in mail "${world.mail.Subject}"`).toBeDefined();
    world.ctx[key] = link;
});

// Same encoding checks as the Cypress engine, see engines/cypress/steps/mail.step.js.
Then('I expect the mail is correctly encoded in UTF-8', async ({ world }) => {
    const { mail } = world;
    const headers = rawHeaderBlock(mail.raw);
    let decodedRaw;

    expect(() => {
        decodedRaw = new TextDecoder('utf-8', { fatal: true }).decode(binaryStringToBytes(mail.raw));
    }, 'raw SMTP payload is valid UTF-8').not.toThrow();
    expectCleanText('raw SMTP payload', decodedRaw);

    expect(/[^\x00-\x7F]/.test(headers), 'raw headers are 7-bit ASCII (non-ASCII must be RFC 2047 encoded)').toBe(false);

    const rawSubject = rawHeader(headers, 'Subject');

    expect(typeof rawSubject, 'Subject header').toBe('string');
    for (const [, charset] of rawSubject.matchAll(new RegExp(ENCODED_WORD, 'gi'))) {
        expect(charset.toLowerCase(), 'Subject encoded-word charset').toBe('utf-8');
    }
    if (/[^\x00-\x7F]/.test(mail.Subject)) {
        expect(rawSubject, 'non-ASCII subject is RFC 2047 encoded').toMatch(ENCODED_WORD);
    }

    for (const [, contentType] of decodedRaw.matchAll(/^Content-Type:\s*(text\/[^\r\n]*)/gim)) {
        expect(contentType.toLowerCase(), 'text part charset').toMatch(/charset="?utf-8"?/);
    }

    expectCleanText('Subject', mail.Subject);
    expectCleanText('text/plain part', mail.Text);
    expectCleanText('text/html part', he.decode(mail.HTML || ''));

    expect(HTML_ENTITY.test(mail.Subject), `Subject contains an HTML entity: ${mail.Subject}`).toBe(false);
    expect(HTML_ENTITY.test(mail.Text || ''), `text/plain part contains an HTML entity: ${(mail.Text || '').match(HTML_ENTITY)?.[0]}`).toBe(false);
    expect(DOUBLE_ESCAPED_ENTITY.test(mail.HTML || ''), `text/html part contains a double-escaped entity: ${(mail.HTML || '').match(DOUBLE_ESCAPED_ENTITY)?.[0]}`).toBe(false);
});
