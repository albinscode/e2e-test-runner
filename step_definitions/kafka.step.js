import {Given, Then, When} from "@badeball/cypress-cucumber-preprocessor";
import {convert, render} from "./utils";

afterEach(() => {
    cy.task('clearKafka');
});

/**
 * Initialize Kafka with auto-detection of plain vs SASL/SSL (OAUTHBEARER) mode.
 * 
 * When oauthClientId and trustStorePath are both non-empty → SASL/SSL mode (OAUTHBEARER auth + SSL truststore).
 * Otherwise → plain mode (no auth, no SSL).
 * 
 * All values are explicit Gherkin parameters so the feature file controls every setting.
 * Each parameter supports Nunjucks templating (e.g. "{{ env.KAFKA_HOST }}").
 *
 * Parameters:
 *   clientId          — Kafka client ID
 *   broker            — broker address as "host:port"
 *   oauthClientId     — OIDC client_id used to fetch the bearer token (client_credentials grant)
 *   oauthClientSecret — OIDC client_secret
 *   oauthScope        — OIDC scope (e.g. "openid")
 *   oauthEndpoint     — OIDC token endpoint URL
 *   trustStorePath    — absolute local path to the P12 truststore file
 *   trustStorePassword — passphrase for the P12 truststore
 *
 * Example (plain mode — local development):
 *   Given I setup kafka with clientId "e2e-test" and broker "localhost:9092"
 *     and oauthClientId "" and oauthClientSecret ""
 *     and oauthScope "" and oauthEndpoint ""
 *     and trustStorePath "" and trustStorePassword ""
 *
 * Example (SASL/SSL mode — qualification/recette):
 *   Given I setup kafka with clientId "e2e-test" and broker "{{env.KAFKA_HOST}}:{{env.KAFKA_PORT}}"
 *     and oauthClientId "{{env.KAFKA_OAUTH_CLIENT_ID}}" and oauthClientSecret "{{env.KAFKA_OAUTH_CLIENT_SECRET}}"
 *     and oauthScope "openid" and oauthEndpoint "{{env.KAFKA_OAUTH_CLIENT_ENDPOINT_URI}}"
 *     and trustStorePath "{{env.KAFKA_SSL_TRUST_STORE_LOCATION}}" and trustStorePassword "{{env.KAFKA_SSL_TRUST_STORE_PASSWORD}}"
 */
Given(
    'I setup kafka with clientId {string} and broker {string} and oauthClientId {string} and oauthClientSecret {string} and oauthScope {string} and oauthEndpoint {string} and trustStorePath {string} and trustStorePassword {string}',
    (templatedClientId, templatedBroker, templatedOauthClientId, templatedOauthClientSecret, templatedOauthScope, templatedOauthEndpoint, templatedTrustStorePath, templatedTrustStorePassword) => {
        return cy.getContext().then((context) => {
            const broker = render(templatedBroker, context);
            const [host, port] = broker.split(':');
            return cy.task('initKafkaAuto', {
                host,
                port,
                clientId:          render(templatedClientId, context),
                oauthClientId:     render(templatedOauthClientId, context),
                oauthClientSecret: render(templatedOauthClientSecret, context),
                oauthScope:        render(templatedOauthScope, context),
                oauthEndpoint:     render(templatedOauthEndpoint, context),
                trustStorePath:    render(templatedTrustStorePath, context),
                trustStorePassword:render(templatedTrustStorePassword, context),
            });
        });
    }
);

/**
 * Enable Confluent wire format encoding for subsequent Kafka send/receive.
 * Sent messages will be prefixed with the 5-byte Confluent header (magic byte + schema ID).
 * Received messages will have that header stripped automatically.
 */
Given('I enable Confluent wire format with schema id {int}', (schemaId) => {
    return cy.task('enableConfluentWireFormat', { schemaId });
});

Given('I setup kafka with clientId {string} and broker {string}', (templatedClientId, templatedBroker) => {
    cy.getContext().then((context) => {
        const clientId = render(templatedClientId, context);
        const broker = render(templatedBroker, context);

        return cy.task('initKafka', {clientId, broker});
    });
});

Given('I setup kafka producer', () => {
    return cy.task('initKafkaProducer');
});

Given('I setup kafka consumer with groupId {string}', (templatedGroupId) => {
    return cy.getContext().then((context) => {
        const groupId = render(templatedGroupId, context);

        return cy.task('initKafkaConsumer', {groupId});
    });
});

When('I send a Kafka message on the topic {string} with body {string}', (templatedTopic, templatedBody) => {
    return cy.getContext().then((context) => {
        const topic = render(templatedTopic, context);
        const value = JSON.stringify(JSON.parse(render(templatedBody, context)));

        return cy.task('sendKafkaMessage', {topic, value});
    });
});

When('I send a Kafka message on the topic {string} with body:', (templatedTopic, docString) => {
    return cy.getContext().then((context) => {
        const topic = render(templatedTopic, context);
        const value = JSON.stringify(JSON.parse(render(docString, context)));

        return cy.task('sendKafkaMessage', {topic, value});
    });
});

Given('I listen for Kafka messages on the topic {string}', (templatedTopic) => {
    return cy.getContext().then((context) => {
        const topic = render(templatedTopic, context);

        return cy.task('listenKafkaTopic', {topic});
    });
});

Then('I expect {int} message(s) received on Kafka topic {string}', (expectedLength, templatedTopic) => {
    return cy.getContext().then((context) => {
        const topic = render(templatedTopic, context);

        return cy.task('getKafkaMessages', {topic});
    }).then((messages) => {
        expect(messages.length).to.equal(expectedLength);
    });
});

Then('I expect a message on Kafka topic {string} equals to {string}', (templatedTopic, templatedMessage) => {
    let message;
    return cy.getContext().then((context) => {
        const topic = render(templatedTopic, context);
        message = render(templatedMessage, context);

        return cy.task('getKafkaMessages', {topic});
    }).then((messages) => {
        const found = messages.some(msg => msg === message);

        expect(found).to.equal(true);
    });
});

Then('I expect a message on Kafka topic {string} equals to {string} as {string}', (templatedTopic, templatedMessage, type) => {
    let message;
    return cy.getContext().then((context) => {
        const topic = render(templatedTopic, context);
        message = convert(render(templatedMessage, context), type);

        return cy.task('getKafkaMessages', {topic});
    }).then((messages) => {
        const found = messages.some(msg => {
            if ('json' !== type) {
                return msg === message;
            }

            return JSON.stringify(JSON.parse(msg)) === JSON.stringify(message);
        });


        expect(found).to.equal(true);
    });
});

Then('I expect a message on Kafka topic {string} equals to:', (templatedTopic, docString) => {
    let message;
    return cy.getContext().then((context) => {
        const topic = render(templatedTopic, context);
        message = render(docString, context);

        return cy.task('getKafkaMessages', {topic});
    }).then((messages) => {
        const found = messages.some(msg => msg === message);

        expect(found).to.equal(true);
    });
});

Then('I expect a message on Kafka topic {string} contains {string}', (templatedTopic, templatedMessage) => {
    let message;
    return cy.getContext().then((context) => {
        const topic = render(templatedTopic, context);
        message = render(templatedMessage, context);

        return cy.task('getKafkaMessages', {topic});
    }).then((messages) => {
        const found = messages.some(msg => msg.includes(message));

        expect(found).to.equal(true);
    });
});

Then('I expect a message on Kafka topic {string} contains:', (templatedTopic, docString) => {
    let message;
    return cy.getContext().then((context) => {
        const topic = render(templatedTopic, context);
        message = render(docString, context);

        return cy.task('getKafkaMessages', {topic});
    }).then((messages) => {
        const found = messages.some(msg => msg.includes(message));

        expect(found).to.equal(true);
    });
});

Then('I expect a message on Kafka topic {string} matches regex {string}', (templatedTopic, templatedRegex) => {
    let regex;
    return cy.getContext().then((context) => {
        const topic = render(templatedTopic, context);
        regex = new RegExp(render(templatedRegex, context));

        return cy.task('getKafkaMessages', {topic});
    }).then((messages) => {
        const found = messages.some(msg => regex.test(msg));

        expect(found).to.equal(true);
    });
});

Then('I log kafka messages', () => {
    cy.task('logKafkaMessages');
})

Then('I store message from Kafka topic {string} with base64 payload matching correlation id {string} as JSON {string} in context', (templatedTopic, templatedCorrelationId, key) => {
    return cy.getContext().then((context) => {
        const topic = render(templatedTopic, context);
        const correlationId = render(templatedCorrelationId, context);
        return cy.task('getKafkaMessages', {topic}).then((messages) => {
            const found = messages.find(msg => {
                try {
                    const outer = JSON.parse(msg);
                    const decoded = JSON.parse(decodeURIComponent(
                        atob(outer.payload)
                          .split('')
                          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                          .join('')
                    ));
                    return decoded.header && decoded.header.correlation_id === correlationId;
                } catch (_) {
                    return false;
                }
            });
            expect(found, `Expected a DLT message with correlation_id="${correlationId}" on topic "${topic}"`).to.exist;
            return cy.getContext().then((context) => {
                const {ctx} = context;
                ctx[key] = JSON.parse(found);
                return cy.setContext({ctx});
            });
        });
    });
});
