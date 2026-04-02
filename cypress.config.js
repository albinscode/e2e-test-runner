const {defineConfig} = require("cypress");
const createBundler = require("@bahmutov/cypress-esbuild-preprocessor");
const addCucumberPreprocessorPlugin =
    require("@badeball/cypress-cucumber-preprocessor").addCucumberPreprocessorPlugin;
const createEsbuildPlugin =
    require("@badeball/cypress-cucumber-preprocessor/esbuild").createEsbuildPlugin;
const dotenv = require("dotenv");
const path = require('path');
const fs = require('fs');
const https = require('https');
const {Kafka, logLevel} = require('kafkajs');
const he = require('he');
const { Client, Change, Attribute } = require('ldapts');
const { Client: PgClient } = require('pg');

dotenv.config();

const absolutePath = path.resolve(process.env.CYPRESS_FEATURES_PATH);


module.exports = defineConfig({
    e2e: {
        env: process.env,
        specPattern: `${absolutePath}/**/*.feature`,
        // specPattern: `${absolutePath}/**/all_http_services.feature`,
        // specPattern: `${absolutePath}/**/lldap_refresh_token.feature`,
        // specPattern: `${absolutePath}/**/secu_courrier*.feature`,
        // specPattern: `${absolutePath}/**/lldap_fcp_sec*.feature`,
        // specPattern: `${absolutePath}/**/llng_logout*.feature`,
        // specPattern: `${absolutePath}/**/lldap_passwords*.feature`,
        // specPattern: `${absolutePath}/**/lldap_rapprochement_api*.feature`,
        // specPattern: `${absolutePath}/**/lldap_rapprochement_jwt*.feature`,
        // specPattern: `${absolutePath}/**/lldap_create*api.feature`,
        // specPattern: `${absolutePath}/**/lldap_modification*.feature`,
        // specPattern: `${absolutePath}/**/lldap_fcp.feature`,
        // specPattern: `${absolutePath}/**/lldap_secu*.feature`,
        // specPattern: `${absolutePath}/**/lldap_sessions*.feature`,
        // specPattern: `${absolutePath}/**/lldap_connect*.feature`,
        // specPattern: `${absolutePath}/**/dm.feature`,
        // specPattern: `${absolutePath}/**/kafka_all*.feature`,
        // specPattern: `${absolutePath}/**/kafka_tache*.feature`,
        // specPattern: `${absolutePath}/**/lldap_tache*.feature`,
        // specPattern: `${absolutePath}/**/lldap_reset*.feature`,
        // specPattern: `${absolutePath}/**/lldap_cre*kafka*.feature`,
        supportFile: 'support/e2e.js',
        reporter: require.resolve('@badeball/cypress-cucumber-preprocessor/pretty-reporter'),
        async setupNodeEvents(on, config) {
            await addCucumberPreprocessorPlugin(on, config);
            on(
                "file:preprocessor",
                createBundler({
                    plugins: [createEsbuildPlugin(config)],
                })
            );
            let kafka;
            let producer;
            let consumer;
            let kafkaMessages = {};
            let confluentConfig = { enabled: false, schemaId: null };
            let ldapClient;
            let ldapResults = [];
            let dbClient;
            let dbResults = [];
            let dbLastQuery = null;
            let urlOrigin;

            on('task', {
                log(message) {
                    console.log(message);
                    return null;
                },
                logKafkaMessages() {
                    console.log(kafkaMessages);
                    return null;
                },
                clearKafka() {
                    const tasks = [];

                    if (consumer) {
                        tasks.push(consumer.disconnect().catch(() => {
                        }));
                        consumer = null;
                    }

                    if (producer) {
                        tasks.push(producer.disconnect().catch(() => {
                        }));
                        producer = null;
                    }

                    kafkaMessages = {};
                    confluentConfig = { enabled: false, schemaId: null };

                    return Promise.all(tasks).then(() => null);
                },
                initKafka({clientId, broker}) {
                    kafka = new Kafka({
                        clientId: clientId,
                        brokers: [broker],
                        logLevel: logLevel.ERROR,
                    });
                    return null;
                },
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

                    /**
                     * Fetch an OIDC access token using client_credentials grant.
                     * Returns { value: access_token } as expected by kafkajs oauthBearerProvider.
                     */
                    const oauthBearerProvider = () => new Promise((resolve, reject) => {
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

                    kafka = new Kafka({
                        clientId,
                        brokers: [`${host}:${port}`],
                        ssl: {
                            // P12/PKCS12 truststore — Node.js tls accepts pfx + passphrase natively
                            pfx:        fs.readFileSync(trustStorePath),
                            passphrase: trustStorePassword,
                        },
                        sasl: {
                            mechanism: 'oauthbearer',
                            oauthBearerProvider,
                        },
                        logLevel: logLevel.ERROR,
                    });

                    return null;
                },
                /**
                 * Initialize Kafka with auto-detection of plain vs SASL/SSL (OAUTHBEARER) mode.
                 *
                 * When oauthClientId and trustStorePath are both non-empty → SASL/SSL mode.
                 * Otherwise → plain mode (no auth, no SSL).
                 */
                initKafkaAuto({
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
                    if (oauthClientId && trustStorePath) {
                        // SASL/SSL mode — delegate to the same logic as initKafkaSaslSsl
                        const oauthBearerProvider = () => new Promise((resolve, reject) => {
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

                        kafka = new Kafka({
                            clientId,
                            brokers: [`${host}:${port}`],
                            ssl: {
                                pfx:        fs.readFileSync(trustStorePath),
                                passphrase: trustStorePassword,
                            },
                            sasl: {
                                mechanism: 'oauthbearer',
                                oauthBearerProvider,
                            },
                            logLevel: logLevel.ERROR,
                        });
                    } else {
                        // Plain mode — no auth, no SSL
                        kafka = new Kafka({
                            clientId,
                            brokers: [`${host}:${port}`],
                            logLevel: logLevel.ERROR,
                        });
                    }
                    return null;
                },
                /**
                 * Enable Confluent wire format encoding for subsequent sendKafkaMessage calls.
                 * Messages will be prefixed with a 5-byte Confluent header:
                 *   byte 0   : 0x00 (magic byte, always zero — signals Confluent encoding)
                 *   bytes 1-4: schema ID as a 4-byte big-endian integer
                 * The same header will be stripped when receiving messages via listenKafkaTopic.
                 *
                 * About the schema ID:
                 *   The schema ID is an integer assigned by the Confluent Schema Registry to a
                 *   specific version of a schema (Avro, JSON Schema, or Protobuf).
                 *   It acts as a pointer: consumers use it to fetch the correct schema version
                 *   from the registry and deserialise the payload.
                 *
                 *   IMPORTANT: the payload after the 5-byte header does NOT need to be Avro.
                 *   This step only adds the Confluent wire format envelope (magic byte + schema ID).
                 *   The payload remains plain JSON. The schema ID here identifies the schema
                 *   version registered on the customer's Schema Registry — it tells downstream
                 *   consumers which version of the schema to expect, without requiring Avro
                 *   binary serialisation on the producer side.
                 *
                 *   Concretely: schema ID 1 means the registry holds version 1 of your event
                 *   schema. If the customer upgrades the schema, the ID will increment.
                 */
                enableConfluentWireFormat({ schemaId }) {
                    confluentConfig = { enabled: true, schemaId: parseInt(schemaId, 10) };
                    return null;
                },
                initKafkaProducer() {
                    producer = kafka.producer();
                    return null;
                },
                initKafkaConsumer({groupId}) {
                    consumer = kafka.consumer({groupId});
                    return null;
                },
                sendKafkaMessage({topic, value}) {
                    let messageValue = value;

                    if (confluentConfig.enabled) {
                        // Prepend Confluent wire format header: magic byte (0x00) + 4-byte big-endian schema ID
                        const jsonBytes = Buffer.from(value, 'utf8');
                        const buf = Buffer.alloc(5 + jsonBytes.length);
                        buf[0] = 0x00;
                        buf.writeInt32BE(confluentConfig.schemaId, 1);
                        jsonBytes.copy(buf, 5);
                        messageValue = buf;
                    }

                    return producer
                        .connect()
                        .then(() => producer.send({topic, messages: [{value: messageValue}]}))
                        .then(() => producer.disconnect())
                        .then(() => null);
                },
                listenKafkaTopic({topic}) {
                    consumer
                        .connect()
                        .then(() => consumer.subscribe({topic, fromBeginning: true}))
                        .then(() => consumer.run({
                            eachMessage: async ({message}) => {
                                if (!kafkaMessages[topic]) {
                                    kafkaMessages[topic] = [];
                                }

                                let rawValue = message.value;

                                // Strip Confluent wire format header (magic byte 0x00 + 4-byte schema ID)
                                // if Confluent format is enabled and the message starts with the magic byte
                                if (confluentConfig.enabled
                                    && rawValue
                                    && rawValue.length > 5
                                    && rawValue[0] === 0x00) {
                                    rawValue = rawValue.slice(5);
                                }

                                kafkaMessages[topic].push(he.decode(rawValue.toString()));
                            },
                        }));
                    return null;
                },
                getKafkaMessages({topic}) {
                    return kafkaMessages[topic] || [];
                },
                clearLdap() {
                    if (ldapClient) {
                        ldapClient.unbind();
                        ldapResults = [];
                    }
                    return null;
                },
                // for doc about ldapts, see https://github.com/ldapts/ldapts
                async initLdap({url, bindDn, password}) {
                    // TODO could be better to initiate timeouts, connectsTimeouts?
                    ldapClient = new Client({
                        url: url,
                        timeout: 5000,
                        connectTimeout: 10000,
                        strictDN: true
                    });
                    try {
                        await ldapClient.bind(bindDn, password);
                    }
                    catch (err) {
                        console.error('Ldap bind error:', err);
                    }

                    return null;
                },
                async runLdapSearch({baseDn, filter, attributes}) {

                    const opts = {
                        filter: filter,
                        scope: 'sub',
                        attributes: attributes,
                    };

                    try {
                        const entries = await ldapClient.search(baseDn, opts);
                        // entries are returned into a specific property
                        if (entries.searchEntries) {
                            ldapResults = entries.searchEntries;
                        }
                    }
                    catch (err) {
                        console.error('Ldap search error:', err)
                    }
                    return null;
                },
                getLdapResults() {
                    return ldapResults;
                },
                deleteLdapResults() {
                    try {
                        ldapResults.forEach( entry => ldapClient.del(entry.dn));
                        ldapResults = [];
                    }
                    catch (err) {
                        console.error('Ldap delete error:', err)
                    }
                    return null;
                },
                addLdapEntry({entryDn, entry}) {
                    try {
                        ldapClient.add(entryDn, entry);
                    }
                    catch (err) {
                        console.error('Ldap add error:', err)
                    }
                    return null;
                },
                async modifyLdapEntry({entryDn, attribute, value}) {
                    try {
                        await ldapClient.modify(entryDn, [
                            new Change({
                                operation: 'replace',
                                modification: new Attribute({ type: attribute, values: [value] })
                            })
                        ]);
                    }
                    catch (err) {
                        console.error('Ldap modify error:', err);
                    }
                    return null;
                },
                // You can pass a full connection string or individual parts.
                initDb({ connectionString, driver, user, password, host, port, database }) {
                    const cfg = connectionString
                        ? { connectionString }
                        : { user, password, host, port, database };

                    // we currenly only manage postgres driver
                    if (cfg.driver === 'postgres' || cfg.connectionString.indexOf('postgres') === 0) {
                        dbClient = new PgClient(cfg);
                        dbClient.connect();
                    }
                    else {
                        throw new Error("Unknown db protocol, only postgres managed currently");
                    }
                    return null;
                },

                /**
                 * table:   string   (e.g. "users")
                 * filter:  string   (SQL WHERE clause without the word WHERE, e.g. "age > 30 AND name ILIKE '%john%'")
                 * columns: string   (space separated list, e.g. "id name email")
                 */
                runDbSearch({ table, filter, columns }) {
                    const cols = columns.split(/\s+/).join(', ');
                    const sql = `SELECT ${cols} FROM ${table}` + (filter ? ` WHERE ${filter}` : '');
                    console.log(sql);

                    dbLastQuery = sql;
                    return dbClient
                        .query(sql)
                        .then(res => {
                            dbResults = res.rows;
                            return null;
                        })
                        .catch(err => {
                            console.error('Db search error:', err);
                            throw err;
                        });
                },

                getDbResults() {
                    return dbResults;
                },

                deleteDbResults() {
                    // nothing to delete
                    if (!dbLastQuery) return null;

                    // reuse the same WHERE clause we used for the SELECT.
                    const whereClause = dbLastQuery.split('WHERE')[1];
                    // no WHERE, nothing to delete
                    if (!whereClause) return null;

                    const deleteSql = `DELETE FROM ${dbLastQuery
                        .match(/^SELECT\s+.+?\s+FROM\s+(\S+)/i)[1]} WHERE ${whereClause}`;

                    return dbClient
                        .query(deleteSql)
                        .then(() => {
                            dbResults = [];
                            dbLastQuery = null;
                            return null;
                        })
                        .catch(err => {
                            console.error('Db delete error:', err);
                            throw err;
                        });
                },

                addTableRow({ tableName, rowData }) {
                    if (typeof tableName !== 'string' || !tableName.trim()) {
                        throw new Error('addTableRow: `tableName` must be a non‑empty string');
                    }
                    if (typeof rowData !== 'object' || rowData === null) {
                        throw new Error('addTableRow: `rowData` must be an object');
                    }

                    const columns = Object.keys(rowData);
                    const values  = Object.values(rowData);

                    // We must **quote** identifiers because table/column names may be camelCase or
                    // reserved words. PostgreSQL double‑quotes are safe as long as we escape any
                    // embedded double‑quote by doubling it.
                    const quoteIdent = (ident) => `"${ident.replace(/"/g, '""')}"`;

                    const columnList = columns.map(quoteIdent).join(', ');
                    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

                    const sql = `INSERT INTO ${quoteIdent(tableName)} (${columnList})
                                 VALUES (${placeholders})
                                 RETURNING *;`;

                    return dbClient
                        .query(sql, values)
                        .then( () => { return null })
                        .catch(err => {
                            console.error('Db create error:', err);
                            throw err;
                        });

                },

                clearDb() {
                    dbResults = [];
                    dbLastQuery = null;
                    return null;
                },

                closeDb() {
                    if (dbClient) {
                        return dbClient.end();
                    }
                    return null;
                },

                setUrlOrigin({url}) {
                    urlOrigin = url;
                    return null;
                },
                clearUrlOrigin() {
                    urlOrigin = '';
                    return null;
                },
                getUrlOrigin() {
                    return urlOrigin;
                }
            });

            return config;
        },
    }
});
