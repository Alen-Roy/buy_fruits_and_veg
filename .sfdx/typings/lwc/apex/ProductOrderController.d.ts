declare module "@salesforce/apex/ProductOrderController.getProducts" {
  export default function getProducts(): Promise<any>;
}
declare module "@salesforce/apex/ProductOrderController.createOrder" {
  export default function createOrder(param: {customerName: any, items: any}): Promise<any>;
}
