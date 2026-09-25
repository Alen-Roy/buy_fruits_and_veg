public with sharing class ProductOrderController {

    @AuraEnabled(cacheable=true)
    public static List<Product__c> getProducts() {
        return [
            SELECT Id, Name, Price__c, Category__c, Description__c, Image_URL__c
            FROM Product__c
            ORDER BY Category__c, Name
        ];
    }

    @AuraEnabled
    public static String createOrder(String customerName, List<OrderItemWrapper> items) {
        Order__c newOrder = new Order__c(
            Customer_Name__c = customerName,
            Order_Date__c = Date.today(),
            Status__c = 'New'
        );
        insert newOrder;

        List<Order_Item__c> lineItems = new List<Order_Item__c>();
        for (OrderItemWrapper item : items) {
            lineItems.add(new Order_Item__c(
                Order__c = newOrder.Id,
                Product__c = item.productId,
                Quantity__c = item.quantity,
                Unit_Price__c = item.price
            ));
        }
        insert lineItems;

        return newOrder.Name;
    }

    public class OrderItemWrapper {
        @AuraEnabled public Id productId;
        @AuraEnabled public Decimal quantity;
        @AuraEnabled public Decimal price;
    }
}