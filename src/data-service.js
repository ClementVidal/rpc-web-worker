
/**
 * This is the service that will be exposed over RPC
 */
export class DataService {

  processData(values) {
    return values.reduce((acc, val) => acc + val, 0);
  }

}
