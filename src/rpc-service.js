export class RPCService {

  constructor(config) {

    // This is the map of ongoing remote function call
    this.pendingRequests = new Map();
    // The map of registered hosts
    this.hosts = new Map();
    // Counter to generate unique id for each request
    this.nextMessageId = 0;

    this.apiWrapper = {
      sendResponse: config.sendResponse,
      sendRequest: config.sendRequest,
      attachRequestHandler: config.attachRequestHandler,
      attachResponseHandler: config.attachResponseHandler
    };

    // Attach request/response handler to the RPC implementation
    if (this.apiWrapper.attachRequestHandler) {
      this.apiWrapper.attachRequestHandler(this.handleRequest.bind(this));
    }
    if (this.apiWrapper.attachResponseHandler) {
      this.apiWrapper.attachResponseHandler(this.handleResponse.bind(this));
    }
  }

  /**
   * Associate an existing service/object to a host name.
   * We'll use that hostName to create the proxy
   * @param {string} hostName
   * @param {any} host
   */
  registerHost(hostName, host) {
    this.hosts.set(hostName, host);
  }

  /**
   * Create a proxy over a given host
   * @param {sring} hostName The host name of the host to proxy
   */
  createProxy(hostName) {
    // "proxied" object
    const proxyedObject = {
      hostName: hostName
    };

    // Create the proxy object
    return new Proxy(
      // "proxied" object
      proxyedObject,
      // Handlers
      this.createHandler()
    );
  }

  /**
   * Create the es6 proxy handler object
   * @private
   */
  createHandler() {
    return {
      get: (obj, methodName) => {
        // Chrome runtime could try to call those method if the proxy object
        // is passed in a resolve or reject Promise function
        if (methodName === "then" || methodName === "catch") return undefined;

        // If accessed field effectivly exist on proxied object,
        // act as a noop
        if (obj[methodName]) {
          return obj[methodName];
        }

        // Otherwise create an anonymous function on the fly
        return (...args) => {
          // Notice here that we pass the hostName defined
          // in the proxied object
          return this.sendRequest(methodName, args, obj.hostName);
        };
      }
    };
  }

  /**
   * @private
   * @param {string} methodName
   * @param {string} args
   * @param {string} hostName
   */
  sendRequest(methodName, args, hostName) {
    return new Promise((resolve, reject) => {
      const message = {
        id: this.nextMessageId++,
        type: "request",
        request: {
          hostName: hostName,
          methodName: methodName,
          args: args
        }
      };

      this.pendingRequests.set(message.id, {
        resolve: resolve,
        reject: reject,
        id: message.id,
        methodName: methodName,
        args: args
      });

      console.log("Sending request", message);

      // This call will vary depending on which API you are using
      this.apiWrapper.sendRequest(message);
    });
  }

  /**
   *
   * @private
   * @param {RPCMessage} message
   */
  handleRequest(message) {
    if (message.type === "request") {

      console.log("Handling request", message);

      const request = message.request;
      // This is where the real implementation is called
      this.executeHostMethod(request.hostName, request.methodName, request.args)
        // Build and send the response
        .then((returnValue) => {
          const rpcMessage = {
            id: message.id,
            type: "response",
            response: {
              returnValue: returnValue
            }
          };

          console.log("Sending response", rpcMessage);
          this.apiWrapper.sendResponse(rpcMessage);
        })
        // Or send error if host method throw an exception
        .catch((err) => {
          const rpcMessage = {
            id: message.id,
            type: "response",
            response: {
              returnValue: null,
              err: err.toString()
            }
          };

          // This call will vary depending on which API you are using
          this.apiWrapper.sendResponse(rpcMessage);
        });
      return true;
    }
  }

  /**
   * @private
   * @param {RPCMessage} message
   */
  handleResponse(message) {
    if (message.type === "response") {

      console.log("Handling response", message);

      // Get the pending request matching this response
      // and delete it from the pending request list
      const pendingRequest = this.pendingRequests.get(message.id);
      if (!pendingRequest) {
        console.warn(
          "RPCService received a response for a non pending request"
        );
        return;
      }

      this.pendingRequests.delete(message.id);

      // resolve or reject the original promise returned from the rpc call
      const response = message.response;
      // If an error was detected while sending the message,
      // reject the promise;
      if (response.err) {
        // If the remote method failed to execute, reject the promise
        pendingRequest.reject(response.err);
      } else {
        // Otherwise resolve it with payload value.
        pendingRequest.resolve(response.returnValue);
      }
    }
  }

  /**
   * Execute the real metho on the source object.
   *
   * @private
   * @param {string} hostName
   * @param {strinng} methodName
   * @param {string} args
   */
  executeHostMethod(hostName, methodName, args) {
    // Access the method
    const host = this.hosts.get(hostName);
    if (!host) {
      return Promise.reject(`Invalid host name "${hostName}"`);
    }
    let method = host[methodName];

    // If requested method does not exist, reject.
    if (typeof method !== "function") {
      return Promise.reject(
        `Invalid method name "${methodName}" on host "${hostName}"`
      );
    }

    try {
      // Call the implementation
      let returnValue = method.apply(host, args);

      // If response is a promise, return it as it, otherwise
      // convert it to a promise.
      if (returnValue === undefined) {
        return Promise.resolve();
      }
      if (typeof returnValue.then !== "function") {
        return Promise.resolve(returnValue);
      }
      return returnValue;
    } catch (err) {
      return Promise.reject(err);
    }
  }
}
