var HttpError = require("http_error");


function BodyParser(opts) {
    opts || (opts = {});

    this.rejectUnknown = opts.rejectUnknown ? !!opts.rejectUnknown : false;
    this.limit = typeof(opts.limit) === "number" ? opts.limit : false;
}

BodyParser.express = function(opts) {
    var bodyParser = new BodyParser(opts);

    return function(req, res, next) {

        bodyParser.middleware(req, res, next);
    };
};

BodyParser.connect = BodyParser.express;

BodyParser.prototype.middleware = function(req, res, next) {
    var _this = this,
        contentLength = req.contentLength,
        contentType = req.contentType,
        bytesReceived = 0,
        limit = this.limit,
        method = req.method;

    req.body = {};

    if (!req.headers["transfer-encoding"] && contentLength <= 0) {
        next();
        return;
    }

    if (limit && contentLength > limit) {
        next(new HttpError(413, "Request body size exceeds " + limit));
        return;
    }
    if (method === "HEAD" || (method === "GET")) {
        next();
        return;
    }

    if (!contentType ||
        contentType === "application/json" ||
        contentType === "application/x-www-form-urlencoded" ||
        contentType === "multipart/form-data" ||
        contentType.substr(0, 5) === "text/"
    ) {
        req.rawBody = "";
        if (limit) {
            req.on("data", function(chunk) {
                bytesReceived += Buffer.byteLength(chunk);
                if (bytesReceived > limit) return;

                req.rawBody += chunk.toString(req.charset);
            });
        } else {
            req.on("data", function(chunk) {
                req.rawBody += chunk.toString(req.charset);
            });
        }
    } else {
        req.rawBody = new Buffer(0);
        if (limit) {
            req.on("data", function(chunk) {
                bytesReceived += chunk.length;
                if (bytesReceived > limit) return;

                req.rawBody = Buffer.concat([req.rawBody, chunk]);
            });
        } else {
            req.on("data", function(chunk) {
                req.rawBody = Buffer.concat([req.rawBody, chunk]);
            });
        }
    }

    req.on("end", function(err) {
        if (err) {
            next(err);
            return;
        }
        if (bytesReceived > limit) {
            next(new HttpError(413));
            return;
        }

        _this.parse(req, res, next);
    });
};

BodyParser.prototype.parse = function(req, res, next) {
    var contentType = req.contentType,
        parser;

    if (contentType === "application/json") {
        parser = jsonParser;
    } else if (contentType === "application/x-www-form-urlencoded") {
        parser = urlEncodedParser;
    } else if (
        contentType === "multipart/form-data" ||
        contentType === "text/tsv" ||
        contentType === "text/tab-separated-values" ||
        contentType === "text/csv"
    ) {
        parser = multipartParser;
    }

    if (parser) {
        parser(req, next);
        return;
    }
    if (rejectUnknown) {
        next(new HttpError(415));
        return;
    }

    next();
};


function jsonParser(req, next) {
    if (!req.rawBody) {
        next();
        return;
    }
    var body = req.rawBody,
        params;

    try {
        params = JSON.parse(body);
    } catch (e) {
        next(new HttpError(415, "Invalid JSON: " + e.message));
        return;
    }

    mixin(req.body, params);

    next();
}

function multipartParser(req, next) {
    if (!req.rawBody) {
        next();
        return;
    }
    var body = req.rawBody,
        params;

    try {
        params = queryStringParse(body);
    } catch (e) {
        next(new HttpError(415, "Invalid Form: " + e.message));
        return;
    }

    mixin(req.body, params);

    next();
}

function urlEncodedParser(req, next) {
    if (!req.rawBody) {
        next();
        return;
    }
    var body = req.rawBody,
        params;

    try {
        params = queryStringParse(body);
    } catch (e) {
        next(new HttpError(415, "Invalid URL: " + e.message));
        return;
    }

    mixin(req.body, params);

    next();
}

var queryStringParse_regexp = /\+/g,
    hasOwnProperty = Object.prototype.hasOwnProperty

function queryStringParse(qs, sep, eq, options) {
    var obj = {},
        has = hasOwnProperty,
        regexp = queryStringParse_regexp,
        maxKeys = 1000,
        decode = decodeURIComponent,
        maxKeys, len, i, x, idx, kstr, vstr, k, v, tmp;

    sep = sep || "&";
    eq = eq || "=";

    if (typeof(qs) !== "string" || qs.length === 0) return obj;
    qs = qs.split(sep);

    maxKeys = 1000;
    if (options && (options.maxKeys === +options.maxKeys)) {
        maxKeys = options.maxKeys;
    }

    len = qs.length;
    if (maxKeys > 0 && len > maxKeys) len = maxKeys;

    if (options && typeof(options.decodeURIComponent) === "function") decode = options.decodeURIComponent;

    for (i = 0; i < len; i++) {
        x = qs[i].replace(regexp, "%20");
        idx = x.indexOf(eq);

        if (idx >= 0) {
            kstr = x.substr(0, idx);
            vstr = x.substr(idx + 1);
        } else {
            kstr = x;
            vstr = '';
        }

        try {
            k = decode(kstr);
            v = decode(vstr);
            if ((tmp = +v)) v = tmp;
        } catch (e) {
            continue;
        }

        if (!has.call(obj, k)) {
            obj[k] = v;
        } else if (Array.isArray(obj[k])) {
            obj[k].push(v);
        } else {
            obj[k] = [obj[k], v];
        }
    }

    return obj;
}

module.exports = BodyParser;
