const { expect } = require('@playwright/test');
const { isDeepStrictEqual } = require('util');
const { Given, Then, When } = require('../fixtures');
const { convert, findMessageByCorrelationId, render } = require('../../../core/utils');

Given('I setup kafka with clientId {string} and broker {string}', async ({ kafka, world }, templatedClientId, templatedBroker) => {
    kafka.initKafka({
        clientId: render(templatedClientId, world),
        broker: render(templatedBroker, world),
    });
});

// Plain mode, or SASL/SSL (OAUTHBEARER) mode when oauthClientId and trustStorePath are both set.
Given('I setup kafka with clientId {string} and broker {string} and oauthClientId {string} and oauthClientSecret {string} and oauthScope {string} and oauthEndpoint {string} and trustStorePath {string} and trustStorePassword {string}',
    async ({ kafka, world }, templatedClientId, templatedBroker, templatedOauthClientId, templatedOauthClientSecret, templatedOauthScope, templatedOauthEndpoint, templatedTrustStorePath, templatedTrustStorePassword) => {
        const [host, port] = render(templatedBroker, world).split(':');

        kafka.initKafkaAuto({
            host,
            port,
            clientId: render(templatedClientId, world),
            oauthClientId: render(templatedOauthClientId, world),
            oauthClientSecret: render(templatedOauthClientSecret, world),
            oauthScope: render(templatedOauthScope, world),
            oauthEndpoint: render(templatedOauthEndpoint, world),
            trustStorePath: render(templatedTrustStorePath, world),
            trustStorePassword: render(templatedTrustStorePassword, world),
        });
    });

// Sent messages get the 5-byte Confluent header (magic byte + schema id), stripped from received ones.
Given('I enable Confluent wire format with schema id {int}', async ({ kafka }, schemaId) => {
    kafka.enableConfluentWireFormat({ schemaId });
});

Given('I setup kafka producer', async ({ kafka }) => {
    kafka.initKafkaProducer();
});

Given('I setup kafka consumer with groupId {string}', async ({ kafka, world }, templatedGroupId) => {
    kafka.initKafkaConsumer({ groupId: render(templatedGroupId, world) });
});

When('I send a Kafka message on the topic {string} with body {string}', async ({ kafka, world }, templatedTopic, templatedBody) => {
    const topic = render(templatedTopic, world);
    const value = JSON.stringify(JSON.parse(render(templatedBody, world)));

    await kafka.sendKafkaMessage({ topic, value });
});

When('I send a Kafka message on the topic {string} with body:', async ({ kafka, world }, templatedTopic, docString) => {
    const topic = render(templatedTopic, world);
    const value = JSON.stringify(JSON.parse(render(docString, world)));

    await kafka.sendKafkaMessage({ topic, value });
});

Given('I listen for Kafka messages on the topic {string}', async ({ kafka, world }, templatedTopic) => {
    await kafka.listenKafkaTopic({ topic: render(templatedTopic, world) });
});

Given('I listen for new Kafka messages on the topic {string}', async ({ kafka, world }, templatedTopic) => {
    await kafka.listenKafkaTopic({ topic: render(templatedTopic, world), fromBeginning: false });
});

Then('I expect {int} message(s) received on Kafka topic {string}', async ({ kafka, world }, expectedLength, templatedTopic) => {
    const messages = kafka.getKafkaMessages({ topic: render(templatedTopic, world) });

    expect(messages.length).toBe(expectedLength);
});

Then('I expect a message on Kafka topic {string} equals to {string}', async ({ kafka, world }, templatedTopic, templatedMessage) => {
    const messages = kafka.getKafkaMessages({ topic: render(templatedTopic, world) });
    const message = render(templatedMessage, world);

    expect(messages.some((msg) => msg === message)).toBe(true);
});

Then('I expect a message on Kafka topic {string} equals to {string} as {string}', async ({ kafka, world }, templatedTopic, templatedMessage, type) => {
    const messages = kafka.getKafkaMessages({ topic: render(templatedTopic, world) });
    const message = convert(render(templatedMessage, world), type);
    const found = messages.some((msg) => {
        if (type !== 'json') {
            return msg === message;
        }

        return isDeepStrictEqual(JSON.parse(msg), message);
    });

    expect(found).toBe(true);
});

Then('I expect a message on Kafka topic {string} equals to:', async ({ kafka, world }, templatedTopic, docString) => {
    const messages = kafka.getKafkaMessages({ topic: render(templatedTopic, world) });
    const message = render(docString, world);

    expect(messages.some((msg) => msg === message)).toBe(true);
});

Then('I expect a message on Kafka topic {string} contains {string}', async ({ kafka, world }, templatedTopic, templatedMessage) => {
    const messages = kafka.getKafkaMessages({ topic: render(templatedTopic, world) });
    const message = render(templatedMessage, world);

    expect(messages.some((msg) => msg.includes(message))).toBe(true);
});

Then('I expect a message on Kafka topic {string} contains:', async ({ kafka, world }, templatedTopic, docString) => {
    const messages = kafka.getKafkaMessages({ topic: render(templatedTopic, world) });
    const message = render(docString, world);

    expect(messages.some((msg) => msg.includes(message))).toBe(true);
});

Then('I expect a message on Kafka topic {string} matches regex {string}', async ({ kafka, world }, templatedTopic, templatedRegex) => {
    const messages = kafka.getKafkaMessages({ topic: render(templatedTopic, world) });
    const regex = new RegExp(render(templatedRegex, world));

    expect(messages.some((msg) => regex.test(msg))).toBe(true);
});

Then('I log kafka messages', async ({ kafka }) => {
    kafka.logKafkaMessages();
});

Then('I store message from Kafka topic {string} with base64 payload matching correlation id {string} as JSON {string} in context', async ({ kafka, world }, templatedTopic, templatedCorrelationId, key) => {
    const topic = render(templatedTopic, world);
    const correlationId = render(templatedCorrelationId, world);
    const found = findMessageByCorrelationId(kafka.getKafkaMessages({ topic }), correlationId);

    expect(found, `Expected a message with correlation_id="${correlationId}" on topic "${topic}"`).toBeDefined();
    world.ctx[key] = JSON.parse(found);
});
