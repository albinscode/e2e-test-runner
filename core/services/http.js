const http = require('http');
const https = require('https');

class HttpService {
    // Plain Node-side HTTP request, independent of the browser's cookie jar.
    // Used when a call must NOT carry the browser's SSO session cookie
    // (e.g. LemonLDAP's unauth-only /refreshsessions route, which is only
    // reachable when the request looks unauthenticated).
    httpRequestNoCookies({method, url, headers = {}, body}) {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);
            const lib = parsedUrl.protocol === 'https:' ? https : http;
            const requestHeaders = {...headers};
            if (body) {
                requestHeaders['Content-Length'] = Buffer.byteLength(body);
            }

            const req = lib.request({
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
                path: parsedUrl.pathname + parsedUrl.search,
                method,
                headers: requestHeaders,
                rejectUnauthorized: false,
            }, (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    let parsedBody;
                    try {
                        parsedBody = JSON.parse(data);
                    } catch (e) {
                        parsedBody = data;
                    }
                    resolve({status: res.statusCode, headers: res.headers, body: parsedBody});
                });
            });

            req.on('error', reject);
            if (body) {
                req.write(body);
            }
            req.end();
        });
    }
}

module.exports = HttpService;
