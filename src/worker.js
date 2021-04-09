import { RPCService } from "./rpc-service";

async function run() {

  // Setup the messaging API implementation
  function sendRequest(message) {
    self.postMessage(message);
  }
  function attachResponseHandler(handler) {
    self.onmessage = (m) => {
      handler(m.data);
    }
  }

  // Create the RPC service
  const rpcService = new RPCService({
    sendRequest,
    attachResponseHandler
  });

  // Create a proxy to the "DataService" implementation in main thread
  const proxy = rpcService.createProxy("DataService");
  // Call remote procedure
  console.log("Issuing RPC call");
  const restul = await proxy.processData([1, 4, 9]);
  console.log("Result", restul);
}

run();
