public with sharing class ProductOrderController {

    private static final Integer MAX_NAME_LENGTH = 80;
    private static final Integer MAX_ITEMS = 100;
    private static final Integer MAX_QUANTITY = 999;

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
        String trimmedName = customerName == null ? '' : customerName.trim();
        if (trimmedName.length() == 0) {
            throwAuraError('Enter your name before placing the order.');
        }
        if (trimmedName.length() > MAX_NAME_LENGTH) {
            throwAuraError('Name must be ' + MAX_NAME_LENGTH + ' characters or fewer.');
        }
        if (items == null || items.isEmpty()) {
            throwAuraError('No order items received. Please refresh the page and try again.');
        }
        if (items.size() > MAX_ITEMS) {
            throwAuraError('An order can contain at most ' + MAX_ITEMS + ' items.');
        }

        Set<Id> productIds = new Set<Id>();
        for (OrderItemWrapper item : items) {
            if (item == null || item.productId == null || item.quantity == null) {
                throwAuraError(
                    'Invalid order item payload: ' + JSON.serialize(item) +
                    '. Please refresh the page and try again.'
                );
            }
            if (item.quantity != item.quantity.round(System.RoundingMode.DOWN)) {
                throwAuraError('Quantity must be a whole number for every item.');
            }
            if (item.quantity < 1) {
                throwAuraError('Quantity must be at least 1 for every item.');
            }
            if (item.quantity > MAX_QUANTITY) {
                throwAuraError('Quantity cannot exceed ' + MAX_QUANTITY + ' per item.');
            }
            productIds.add(item.productId);
        }

        Map<Id, Decimal> currentPrices = new Map<Id, Decimal>();
        for (Product__c product : [SELECT Id, Price__c FROM Product__c WHERE Id IN :productIds]) {
            currentPrices.put(product.Id, product.Price__c);
        }
        if (currentPrices.size() != productIds.size()) {
            throwAuraError('Some products in your cart are no longer available. Please refresh the page and try again.');
        }

        Savepoint sp = Database.setSavepoint();
        try {
            Order__c newOrder = new Order__c(
                Customer_Name__c = trimmedName,
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
                    Unit_Price__c = currentPrices.get(item.productId)
                ));
            }
            insert lineItems;
            return [SELECT Name FROM Order__c WHERE Id = :newOrder.Id].Name;
        } catch (DmlException e) {
            Database.rollback(sp);
            throwAuraError('We could not save your order: ' + e.getDmlMessage(0));
        }
        return null;
    }

    private static void throwAuraError(String message) {
        AuraHandledException e = new AuraHandledException(message);
        e.setMessage(message);
        throw e;
    }

    public class OrderItemWrapper {
        @AuraEnabled public Id productId { get; set; }
        @AuraEnabled public Decimal quantity { get; set; }
        @AuraEnabled public Decimal price { get; set; }
    }
}
