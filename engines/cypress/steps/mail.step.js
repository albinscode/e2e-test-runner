import {Given, Then, When} from "@badeball/cypress-cucumber-preprocessor";
import he from "he";
import {render} from "../../../core/utils";
import {
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
} from "../../../core/mail";

/*
 * Mail steps backed by the Mailpit REST API (https://mailpit.axllent.org/docs/api-v1/).
 *
 * Mails really sent by the SSO portal over SMTP are read back from Mailpit, so the
 * tests exercise the production code path (no dev-only interception route) and can
 * assert on what the user actually receives: subject, bodies, links and encoding.
 *
 * The last fetched mail is stored in the context as `mail` (like `response` for HTTP):
 *   {{ mail.Subject }}, {{ mail.Text }}, {{ mail.HTML }}, {{ mail.To[0].Address }}...
 */

function mailpitUrl(context) {
    expect(context.mailpitUrl, 'Mailpit url (use step: I setup mailpit with url "...")').to.be.a('string').and.not.be.empty;
    return context.mailpitUrl;
}

function searchMails(context, recipient, subject) {
    return cy.request({
        method: 'GET',
        url: `${mailpitUrl(context)}/api/v1/search`,
        qs: {query: searchQuery(recipient, subject), limit: 200},
    }).then((response) => filterRecipient(response.body.messages, recipient));
}

function waitForMail(context, recipient, subject, attempt = 1) {
    return searchMails(context, recipient, subject).then((messages) => {
        if (messages.length > 0) {
            return messages[0];
        }
        if (attempt >= MAIL_POLL_ATTEMPTS) {
            throw noMailError(recipient, subject);
        }
        return cy.wait(MAIL_POLL_INTERVAL_MS).then(() => waitForMail(context, recipient, subject, attempt + 1));
    });
}

function fetchMail(context, summary) {
    const base = `${mailpitUrl(context)}/api/v1/message/${summary.ID}`;

    return cy.request({method: 'GET', url: base}).then((message) =>
        // "binary" keeps one char per raw byte, so the SMTP payload can be validated byte by byte.
        cy.request({method: 'GET', url: `${base}/raw`, encoding: 'binary'}).then((raw) => {
            cy.setContext({mail: {...message.body, raw: raw.body}});
        })
    );
}

function fetchLastMail(templatedRecipient, templatedSubject) {
    cy.getContext().then((context) => {
        const recipient = render(templatedRecipient, context);
        const subject = templatedSubject && render(templatedSubject, context);

        waitForMail(context, recipient, subject).then((summary) => fetchMail(context, summary));
    });
}

function expectCleanText(label, value) {
    const text = value || '';
    expect(REPLACEMENT_CHAR.test(text), `${label} contains U+FFFD (invalid UTF-8 bytes): ${text}`).to.be.false;
    expect(MOJIBAKE.test(text), `${label} contains mojibake (UTF-8 read as Latin-1): ${text.match(MOJIBAKE)?.[0]}`).to.be.false;
    expect(C1_CONTROLS.test(text), `${label} contains C1 control characters (UTF-8 read as Latin-1)`).to.be.false;
}

Given('I setup mailpit with url {string}', (templatedUrl) => {
    cy.getContext().then((context) => {
        cy.setContext({mailpitUrl: render(templatedUrl, context).replace(/\/+$/, '')});
    });
});

Given('I delete all mails sent to {string}', (templatedRecipient) => {
    cy.getContext().then((context) => {
        searchMails(context, render(templatedRecipient, context)).then((messages) => {
            if (messages.length > 0) {
                cy.request({
                    method: 'DELETE',
                    url: `${mailpitUrl(context)}/api/v1/messages`,
                    body: {IDs: messages.map((message) => message.ID)},
                });
            }
        });
    });
});

When('I get the last mail sent to {string}', (templatedRecipient) => {
    fetchLastMail(templatedRecipient);
});

When('I get the last mail sent to {string} with subject {string}', (templatedRecipient, templatedSubject) => {
    fetchLastMail(templatedRecipient, templatedSubject);
});

Then('I expect {int} mail(s) sent to {string}', (expected, templatedRecipient) => {
    cy.getContext().then((context) => {
        const recipient = render(templatedRecipient, context);

        searchMails(context, recipient).then((messages) => {
            expect(messages.length, `mails sent to ${recipient}`).to.equal(expected);
        });
    });
});

Then('I expect the mail subject is {string}', (templatedExpected) => {
    cy.getContext().then((context) => {
        expect(context.mail.Subject).to.equal(render(templatedExpected, context));
    });
});

// Checks the text is present, correctly decoded, in both the text/plain and text/html parts.
Then('I expect the mail contains {string}', (templatedExpected) => {
    cy.getContext().then((context) => {
        const expected = render(templatedExpected, context);

        expect(context.mail.Text.replace(/\s+/g, ' '), 'text/plain part').to.contain(expected);
        expect(htmlToText(context.mail.HTML), 'text/html part').to.contain(expected);
    });
});

Then('I store the mail link containing {string} as {string} in context', (templatedPart, key) => {
    cy.getContext().then((context) => {
        const part = render(templatedPart, context);
        const link = extractLinks(context.mail.HTML).find((href) => href.includes(part));

        expect(link, `link containing "${part}" in mail "${context.mail.Subject}"`).to.be.a('string');

        const {ctx} = context;

        ctx[key] = link;

        return cy.setContext({ctx});
    });
});

/*
 * Guards against the encoding regressions already met on the portal mails
 * (see unif-comptes-portal configuration/plugin/Plugins/Lib/SmtpEncodingFix.pm):
 *  - raw SMTP payload not valid UTF-8 (lone 0xA0 byte from a mis-decoded "&nbsp;"),
 *  - body/subject double-encoded ("RÃ©initialisation", "HÃ©lÃ¨ne"),
 *  - non-ASCII subject not RFC 2047 encoded, or encoded with a charset other than UTF-8,
 *  - text parts declared with a charset other than UTF-8,
 *  - HTML entities leaking into the subject / text part, or double-escaped in the HTML part.
 */
Then('I expect the mail is correctly encoded in UTF-8', () => {
    cy.getContext().then((context) => {
        const {mail} = context;
        const headers = rawHeaderBlock(mail.raw);

        let decodedRaw;
        expect(() => {
            decodedRaw = new TextDecoder('utf-8', {fatal: true}).decode(binaryStringToBytes(mail.raw));
        }, 'raw SMTP payload is valid UTF-8').not.to.throw();
        expectCleanText('raw SMTP payload', decodedRaw);

        expect(/[^\x00-\x7F]/.test(headers), 'raw headers are 7-bit ASCII (non-ASCII must be RFC 2047 encoded)').to.be.false;

        const rawSubject = rawHeader(headers, 'Subject');
        expect(rawSubject, 'Subject header').to.be.a('string');
        for (const [, charset] of rawSubject.matchAll(new RegExp(ENCODED_WORD, 'gi'))) {
            expect(charset.toLowerCase(), 'Subject encoded-word charset').to.equal('utf-8');
        }
        if (/[^\x00-\x7F]/.test(mail.Subject)) {
            expect(rawSubject, 'non-ASCII subject is RFC 2047 encoded').to.match(ENCODED_WORD);
        }

        for (const [, contentType] of decodedRaw.matchAll(/^Content-Type:\s*(text\/[^\r\n]*)/gim)) {
            expect(contentType.toLowerCase(), 'text part charset').to.match(/charset="?utf-8"?/);
        }

        expectCleanText('Subject', mail.Subject);
        expectCleanText('text/plain part', mail.Text);
        expectCleanText('text/html part', he.decode(mail.HTML || ''));

        expect(HTML_ENTITY.test(mail.Subject), `Subject contains an HTML entity: ${mail.Subject}`).to.be.false;
        expect(HTML_ENTITY.test(mail.Text || ''), `text/plain part contains an HTML entity: ${(mail.Text || '').match(HTML_ENTITY)?.[0]}`).to.be.false;
        expect(DOUBLE_ESCAPED_ENTITY.test(mail.HTML || ''), `text/html part contains a double-escaped entity: ${(mail.HTML || '').match(DOUBLE_ESCAPED_ENTITY)?.[0]}`).to.be.false;
    });
});
