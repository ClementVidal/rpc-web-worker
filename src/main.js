import { RPCService } from "./rpc-service";
import { DataService } from "./data-service";

// Load the worker
var worker = new Worker("worker.js");

// Setup the messaging API implementation
function sendResponse(message) {
  worker.postMessage(message);
}

function attachRequestHandler(handler) {
  worker.onmessage = (m) => {
    handler(m.data);
  }
}

// Create the RPC service
const rpcService = new RPCService({
  sendResponse,
  attachRequestHandler
});

// And finally register a "DataService" host in the RPC service
const dataService = new DataService();
rpcService.registerHost("DataService", dataService);
