const {Client: PgClient} = require('pg');

class DbService {
    constructor() {
        this.client = null;
        this.results = [];
        this.lastQuery = null;
    }

    // You can pass a full connection string or individual parts.
    async initDb({connectionString, driver, user, password, host, port, database}) {
        const cfg = connectionString
            ? {connectionString}
            : {user, password, host, port, database};

        // we currenly only manage postgres driver
        if (driver === 'postgres' || (connectionString && connectionString.indexOf('postgres') === 0)) {
            if (this.client) {
                await this.client.end();
                this.client = null;
            }
            this.client = new PgClient(cfg);
            await this.client.connect();
        } else {
            throw new Error('Unknown db protocol, only postgres managed currently');
        }

        return null;
    }

    /**
     * sqlRequest:   string  the whole sql request with optional $1, $2, etc. placeholders
     * values:       array   (optional) values to bind to placeholders
     *
     * Examples:
     * - Raw SQL: { sqlRequest: "SELECT * FROM users" }
     * - Parameterized: { sqlRequest: "INSERT INTO users (name, age) VALUES ($1, $2)", values: ["John", 30] }
     */
    async runDbRequest({sqlRequest, values}) {
        this.lastQuery = sqlRequest;

        try {
            const res = await this.client.query(sqlRequest, values);
            this.results = res.rows || [];
            return null;
        } catch (err) {
            console.error('Db query error:', err);
            throw err;
        }
    }

    /**
     * table:   string   (e.g. "users")
     * filter:  string   (SQL WHERE clause without the word WHERE, e.g. "age > 30 AND name ILIKE '%john%'")
     * columns: string   (space separated list, e.g. "id name email")
     */
    async runDbSearch({table, filter, columns}) {
        const cols = columns.split(/\s+/).join(', ');
        const sql = `SELECT ${cols} FROM ${table}` + (filter ? ` WHERE ${filter}` : '');
        console.log(sql);

        this.lastQuery = sql;
        try {
            const res = await this.client.query(sql);
            this.results = res.rows;
            return null;
        } catch (err) {
            console.error('Db search error:', err);
            throw err;
        }
    }

    // Deletes the rows found by the last runDbSearch, reusing its WHERE clause.
    async deleteDbResults() {
        // nothing to delete
        if (!this.lastQuery) return null;

        const whereClause = this.lastQuery.split('WHERE')[1];
        // no WHERE, nothing to delete
        if (!whereClause) return null;

        const table = this.lastQuery.match(/^SELECT\s+.+?\s+FROM\s+(\S+)/i)[1];
        const deleteSql = `DELETE FROM ${table} WHERE ${whereClause}`;

        try {
            await this.client.query(deleteSql);
            this.results = [];
            this.lastQuery = null;
            return null;
        } catch (err) {
            console.error('Db delete error:', err);
            throw err;
        }
    }

    async addTableRow({tableName, rowData}) {
        if (typeof tableName !== 'string' || !tableName.trim()) {
            throw new Error('addTableRow: `tableName` must be a non-empty string');
        }
        if (typeof rowData !== 'object' || rowData === null) {
            throw new Error('addTableRow: `rowData` must be an object');
        }

        const columns = Object.keys(rowData);
        const values = Object.values(rowData);

        // Identifiers are quoted because table/column names may be camelCase or reserved words.
        const quoteIdent = (ident) => `"${ident.replace(/"/g, '""')}"`;

        const columnList = columns.map(quoteIdent).join(', ');
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

        const sql = `INSERT INTO ${quoteIdent(tableName)} (${columnList})
                     VALUES (${placeholders})
                     RETURNING *;`;

        try {
            await this.client.query(sql, values);
            return null;
        } catch (err) {
            console.error('Db create error:', err);
            throw err;
        }
    }

    getDbResults() {
        return this.results;
    }

    clearDb() {
        this.results = [];
        this.lastQuery = null;
        return null;
    }

    closeDb() {
        if (this.client) {
            const client = this.client;
            this.client = null;
            return client.end().then(() => null);
        }
        return null;
    }
}

module.exports = DbService;
