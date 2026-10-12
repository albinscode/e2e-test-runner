import nunjucks from "nunjucks";

export function convert(value, type) {
    if (type === 'boolean') {
        return value === 'true';
    }
    if (type === 'integer') {
        return parseInt(value, 10);
    }
    if (type === 'float') {
        return parseFloat(value);
    }
    if (type === 'json') {
        return JSON.parse(value);
    }

    return value;
}

export function render(template, context) {
    const env = new nunjucks.Environment(null, {autoescape: false});

    env.addFilter('json', obj => JSON.stringify(obj, null, 2));

    return env.renderString(template, context);
}

export function getDataTable(context, dataTable) {
    const result = {};

    // Cypress preprocessor exposes `rawTable`, playwright-bdd exposes `raw()`.
    const rawTable = dataTable.rawTable || dataTable.raw();

    rawTable
        .slice(1)
        .forEach((entry) => {
            const key = render(entry[0], context);
            const value = render(entry[1], context);
            const type = entry[2] || 'string';

            result[key] = convert(value, type);
        });

    return result;
}
// Decodes a base64 string holding UTF-8 bytes (atob alone returns one char per byte).
export function decodeBase64(base64) {
    return new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
}

export function decodeBase64Json(base64) {
    return JSON.parse(decodeBase64(base64));
}

// Payload of a JWT token (base64url encoded).
export function decodeJwtPayload(jwt) {
    return decodeBase64Json(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'));
}

// Kafka message (JSON string) whose base64 `payload` holds a header with the given correlation id.
export function findMessageByCorrelationId(messages, correlationId) {
    return messages.find((msg) => {
        try {
            const decoded = decodeBase64Json(JSON.parse(msg).payload);
            return decoded.header && decoded.header.correlation_id === correlationId;
        } catch (_) {
            return false;
        }
    });
}
