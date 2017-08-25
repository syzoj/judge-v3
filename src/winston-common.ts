import winston = require('winston');
import _ = require('lodash');
import util = require('util');

function formatter(args) {
    var msg = args.level + ' - ' + args.message + (_.isEmpty(args.meta) ? '' : (' - ' + util.inspect(args.meta)));
    return msg;
}

export function configureWinston(verbose: boolean) {
    winston.configure({
        transports: [
            new (winston.transports.Console)({ formatter: formatter })
        ]
    });
    if (verbose) {
        (winston as any).level = 'debug';
    } else {
        (winston as any).level = 'info';
    }
}