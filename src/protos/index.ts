import grpc = require('grpc');
import protoLoader  = require('@grpc/proto-loader');

let PROTO_PATH = __dirname + '/syzoj.judge.proto';

let packageDefinition = protoLoader.loadSync(
  PROTO_PATH,
  {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  }
);
let proto = grpc.loadPackageDefinition(packageDefinition);
export default proto;
