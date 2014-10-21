var HttpError = require("http_error"),
    multiparty = require('multiparty'),
    qs = require("qs");


function BodyParser(options) {
    options || (options = {});

    this.rejectUnknown = options.rejectUnknown ? !!options.rejectUnknown : false;
    this.limit = typeof(options.limit) === "number" ? options.limit : false;
    this.multipartOptions = options.multipart || {};
}

BodyParser.express = function(options) {
    var bodyParser = new BodyParser(options);

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

    if (
        contentType === "multipart/form-data" ||
        contentType === "text/tsv" ||
        contentType === "text/tab-separated-values" ||
        contentType === "text/csv"
    ) {
        new multiparty.Form(this.multipartOptions).parse(req, function(err, fields, files) {
            if (err) {
                next(err);
                return;
            }

            req.files = typeof(req.files) === "object" ? mixin(req.files, files) : files;
            mixin(req.body, fields);

            next();
        });
        return;
    }

    if (!contentType ||
        contentType === "application/x-www-form-urlencoded" ||
        contentType === "application/json" ||
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
    }

    if (parser) {
        parser(req, next);
        return;
    }

    if (this.rejectUnknown) {
        next(new HttpError(415));
        return;
    }

    next();
};


function jsonParser(req, next) {
    var body, params;

    if (!req.rawBody) {
        next();
        return;
    }

    body = req.rawBody;

    try {
        params = JSON.parse(body);
    } catch (e) {
        next(new HttpError(415, "Invalid JSON: " + e.message));
        return;
    }

    mixin(req.body, params);

    next();
}

function urlEncodedParser(req, next) {
    var body, params;

    if (!req.rawBody) {
        next();
        return;
    }

    body = req.rawBody;

    try {
        params = qs.parse(body);
    } catch (e) {
        next(new HttpError(415, "Invalid URL: " + e.message));
        return;
    }

    mixin(req.body, params);

    next();
}

function mixin(a, b) {
    var key, value;

    for (key in b) {
        if (a[key] == null && (value = b[key]) != null) a[key] = value;
    }
    return a;
}


module.exports = BodyParser;
