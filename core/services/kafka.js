const {Kafka, logLevel} = require('kafkajs');
const he = require('he');
const fs = require('fs');
const https = require('https');

/**
 * Build a kafkajs oauthBearerProvider fetching an OIDC access token with the client_credentials grant.
 * Returns { value: access_token } as expected by kafkajs.
 */
function createOauthBearerProvider({oauthClientId, oauthClientSecret, oauthScope, oauthEndpoint}) {
    return () => new Promise((resolve, reject) => {
        const body = `grant_type=client_credentials`
            + `&client_id=${encodeURIComponent(oauthClientId)}`
            + `&client_secret=${encodeURIComponent(oauthClientSecret)}`
            + `&scope=${encodeURIComponent(oauthScope)}`;

        const url = new URL(oauthEndpoint);
        const options = {
            hostname: url.hostname,
            port:     url.port || 443,
            path:     url.pathname + url.search,
            method:   'POST',
            headers:  {
                'Content-Type':   'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(body),
            },
            // Accept self-signed certs on the OIDC endpoint if needed
            rejectUnauthorized: false,
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (!json.access_token) {
                        return reject(new Error(`oauthBearerProvider: no access_token in response: ${data}`));
                    }
                    resolve({ value: json.access_token });
                } catch (e) {
                    reject(new Error(`oauthBearerProvider: failed to parse token response: ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

class KafkaService {
    constructor() {
        this.kafka = null;
        this.producer = null;
        this.consumer = null;
        this.messages = {};
        this.confluentConfig = {enabled: false, schemaId: null};
    }

    logKafkaMessages() {
        console.log(this.messages);
        return null;
    }

    async clearKafka() {
        const disconnects = [];

        if (this.consumer) {
            disconnects.push(this.consumer.disconnect().catch(() => {}));
            this.consumer = null;
        }

        if (this.producer) {
            disconnects.push(this.producer.disconnect().catch(() => {}));
            this.producer = null;
        }

        this.messages = {};
        this.confluentConfig = {enabled: false, schemaId: null};

        await Promise.all(disconnects);
        return null;
    }

    initKafka({clientId, broker}) {
        this.kafka = new Kafka({
            clientId,
            brokers: [broker],
            logLevel: logLevel.ERROR,
        });
        return null;
    }

    /**
     * Initialize Kafka with SASL/SSL (OAUTHBEARER) for remote environments (qual, rec).
     *
     * Parameters (all injected by the caller — typically via env vars rendered in the step):
     *   host              — Kafka broker hostname
     *   port              — Kafka broker port
     *   clientId          — Kafka client ID (optional, defaults to "e2e-test")
     *   oauthClientId     — OIDC client_id for broker authentication
     *   oauthClientSecret — OIDC client_secret for broker authentication
     *   oauthScope        — OIDC scope (optional, defaults to "openid")
     *   oauthEndpoint     — OIDC token endpoint URL (e.g. https://acces-qualif.anah.fr/oauth2/token)
     *   trustStorePath    — Absolute path to the local P12 truststore file
     *   trustStorePassword — Passphrase for the P12 truststore (optional)
     */
    initKafkaSaslSsl({
        host,
        port,
        clientId = 'e2e-test',
        oauthClientId,
        oauthClientSecret,
        oauthScope = 'openid',
        oauthEndpoint,
        trustStorePath,
        trustStorePassword = '',
    }) {
        if (!host || !port) {
            throw new Error('initKafkaSaslSsl: host and port are required');
        }
        if (!oauthClientId || !oauthClientSecret || !oauthEndpoint) {
            throw new Error('initKafkaSaslSsl: oauthClientId, oauthClientSecret and oauthEndpoint are required');
        }
        if (!trustStorePath) {
            throw new Error('initKafkaSaslSsl: trustStorePath is required');
        }

        this.kafka = new Kafka({
            clientId,
            brokers: [`${host}:${port}`],
            ssl: {
                // P12/PKCS12 truststore — Node.js tls accepts pfx + passphrase natively
                pfx:        fs.readFileSync(trustStorePath),
                passphrase: trustStorePassword,
            },
            sasl: {
                mechanism: 'oauthbearer',
                oauthBearerProvider: createOauthBearerProvider({oauthClientId, oauthClientSecret, oauthScope, oauthEndpoint}),
            },
            logLevel: logLevel.ERROR,
        });

        return null;
    }

    /**
     * Initialize Kafka with auto-detection of plain vs SASL/SSL (OAUTHBEARER) mode.
     *
     * When oauthClientId and trustStorePath are both non-empty → SASL/SSL mode.
     * Otherwise → plain mode (no auth, no SSL).
     */
    initKafkaAuto(options) {
        const {host, port, clientId = 'e2e-test', oauthClientId, trustStorePath} = options;

        if (oauthClientId && trustStorePath) {
            return this.initKafkaSaslSsl(options);
        }

        // Plain mode — no auth, no SSL
        this.kafka = new Kafka({
            clientId,
            brokers: [`${host}:${port}`],
            logLevel: logLevel.ERROR,
        });
        return null;
    }

    /**
     * Enable Confluent wire format encoding for subsequent sendKafkaMessage calls.
     * Messages will be prefixed with a 5-byte Confluent header:
     *   byte 0   : 0x00 (magic byte, always zero — signals Confluent encoding)
     *   bytes 1-4: schema ID as a 4-byte big-endian integer
     * The same header will be stripped when receiving messages via listenKafkaTopic.
     *
     * The payload after the header stays plain JSON (no Avro serialisation): the schema ID only
     * tells downstream consumers which schema version, registered on the Schema Registry, to expect.
     */
    enableConfluentWireFormat({schemaId}) {
        this.confluentConfig = {enabled: true, schemaId: parseInt(schemaId, 10)};
        return null;
    }

    initKafkaProducer() {
        this.producer = this.kafka.producer();
        return null;
    }

    initKafkaConsumer({groupId}) {
        this.consumer = this.kafka.consumer({groupId});
        return null;
    }

    async sendKafkaMessage({topic, value}) {
        let messageValue = value;

        if (this.confluentConfig.enabled) {
            // Prepend Confluent wire format header: magic byte (0x00) + 4-byte big-endian schema ID
            const jsonBytes = Buffer.from(value, 'utf8');
            const buf = Buffer.alloc(5 + jsonBytes.length);
            buf[0] = 0x00;
            buf.writeInt32BE(this.confluentConfig.schemaId, 1);
            jsonBytes.copy(buf, 5);
            messageValue = buf;
        }

        await this.producer.connect();
        await this.producer.send({topic, messages: [{value: messageValue}]});
        await this.producer.disconnect();
        return null;
    }

    // fromBeginning: false only receives the messages sent after the consumer joined its group,
    // to ignore the history of long-lived shared topics.
    async listenKafkaTopic({topic, fromBeginning = true}) {
        await this.consumer.connect();
        await this.consumer.subscribe({topic, fromBeginning});
        // Wait until the consumer has joined the group and received partition
        // assignments — only then is it truly ready to receive new messages.
        await new Promise((resolve) => {
            const off = this.consumer.on(this.consumer.events.GROUP_JOIN, () => {
                off();
                resolve();
            });
            this.consumer.run({
                eachMessage: async ({message}) => {
                    if (!this.messages[topic]) {
                        this.messages[topic] = [];
                    }

                    let rawValue = message.value;

                    // Strip Confluent wire format header (magic byte 0x00 + 4-byte schema ID)
                    // if Confluent format is enabled and the message starts with the magic byte
                    if (this.confluentConfig.enabled
                        && rawValue
                        && rawValue.length > 5
                        && rawValue[0] === 0x00) {
                        rawValue = rawValue.slice(5);
                    }

                    this.messages[topic].push(he.decode(rawValue.toString()));
                },
            });
        });
        return null;
    }

    getKafkaMessages({topic}) {
        return this.messages[topic] || [];
    }
}

module.exports = KafkaService;
