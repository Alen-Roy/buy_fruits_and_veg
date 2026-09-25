@IsTest
private class ProductOrderControllerTest {

    private static Product__c newProduct(String name, Decimal price, String category) {
        return new Product__c(
            Name = name,
            Price__c = price,
            Category__c = category,
            Description__c = 'Description for ' + name,
            Image_URL__c = 'https://example.com/images/' + name.toLowerCase() + '.png'
        );
    }

    private static ProductOrderController.OrderItemWrapper newItem(Id productId, Decimal quantity, Decimal price) {
        ProductOrderController.OrderItemWrapper wrapper = new ProductOrderController.OrderItemWrapper();
        wrapper.productId = productId;
        wrapper.quantity = quantity;
        wrapper.price = price;
        return wrapper;
    }

    private static String captureError(String customerName, List<ProductOrderController.OrderItemWrapper> items) {
        try {
            ProductOrderController.createOrder(customerName, items);
        } catch (AuraHandledException e) {
            return e.getMessage();
        }
        System.assert(false, 'Expected AuraHandledException was not thrown');
        return null;
    }

    @IsTest
    static void getProductsReturnsProductsOrderedByCategoryThenName() {
        insert new List<Product__c>{
            newProduct('Zucchini', 15, 'Vegetable'),
            newProduct('Banana', 10, 'Fruit'),
            newProduct('Apple', 20, 'Fruit')
        };

        List<Product__c> result = ProductOrderController.getProducts();

        System.assertEquals(3, result.size());
        System.assertEquals('Apple', result[0].Name);
        System.assertEquals('Banana', result[1].Name);
        System.assertEquals('Zucchini', result[2].Name);
    }

    @IsTest
    static void createOrderStoresOrderAndLineItemsUsingCurrentPrice() {
        Product__c product = newProduct('Apple', 25, 'Fruit');
        insert product;

        Test.startTest();
        String orderName = ProductOrderController.createOrder(
            '  Alen  ',
            new List<ProductOrderController.OrderItemWrapper>{ newItem(product.Id, 3, 1) }
        );
        Test.stopTest();

        System.assertNotEquals(null, orderName);
        List<Order__c> orders = [
            SELECT Customer_Name__c, Order_Date__c, Status__c
            FROM Order__c
            WHERE Name = :orderName
        ];
        System.assertEquals(1, orders.size());
        System.assertEquals('Alen', orders[0].Customer_Name__c, 'Name should be trimmed');
        System.assertEquals(Date.today(), orders[0].Order_Date__c);
        System.assertEquals('New', orders[0].Status__c);

        List<Order_Item__c> lines = [
            SELECT Product__c, Quantity__c, Unit_Price__c
            FROM Order_Item__c
            WHERE Order__c = :orders[0].Id
        ];
        System.assertEquals(1, lines.size());
        System.assertEquals(product.Id, lines[0].Product__c);
        System.assertEquals(3, lines[0].Quantity__c);
        System.assertEquals(25, lines[0].Unit_Price__c, 'Server price must win over the client-sent price');
    }

    @IsTest
    static void createOrderSupportsMultipleLineItems() {
        Product__c apple = newProduct('Apple', 20, 'Fruit');
        Product__c carrot = newProduct('Carrot', 5, 'Vegetable');
        insert new List<Product__c>{ apple, carrot };

        String orderName = ProductOrderController.createOrder(
            'Multi',
            new List<ProductOrderController.OrderItemWrapper>{
                newItem(apple.Id, 2, 20),
                newItem(carrot.Id, 4, 5)
            }
        );

        System.assertNotEquals(null, orderName);
        List<Order_Item__c> lines = [
            SELECT Product__c, Quantity__c, Unit_Price__c
            FROM Order_Item__c
            WHERE Order__r.Name = :orderName
            ORDER BY Quantity__c ASC
        ];
        System.assertEquals(2, lines.size());
        System.assertEquals(apple.Id, lines[0].Product__c);
        System.assertEquals(2, lines[0].Quantity__c);
        System.assertEquals(20, lines[0].Unit_Price__c);
        System.assertEquals(carrot.Id, lines[1].Product__c);
        System.assertEquals(4, lines[1].Quantity__c);
        System.assertEquals(5, lines[1].Unit_Price__c);
    }

    @IsTest
    static void createOrderRejectsBlankName() {
        Product__c product = newProduct('Apple', 10, 'Fruit');
        insert product;

        String message = captureError('   ', new List<ProductOrderController.OrderItemWrapper>{
            newItem(product.Id, 1, 10)
        });

        System.assertEquals('Enter your name before placing the order.', message);
        System.assertEquals(0, [SELECT COUNT() FROM Order__c], 'No order should be created');
    }

    @IsTest
    static void createOrderRejectsOverlongName() {
        Product__c product = newProduct('Apple', 10, 'Fruit');
        insert product;

        String longName = '';
        for (Integer i = 0; i < 81; i++) {
            longName += 'x';
        }
        String message = captureError(longName, new List<ProductOrderController.OrderItemWrapper>{
            newItem(product.Id, 1, 10)
        });

        System.assertEquals('Name must be 80 characters or fewer.', message);
        System.assertEquals(0, [SELECT COUNT() FROM Order__c]);
    }

    @IsTest
    static void createOrderRejectsEmptyItemPayload() {
        String nullMessage = captureError('Alen', null);
        System.assertEquals('No order items received. Please refresh the page and try again.', nullMessage);

        String emptyMessage = captureError('Alen', new List<ProductOrderController.OrderItemWrapper>());
        System.assertEquals('No order items received. Please refresh the page and try again.', emptyMessage);

        System.assertEquals(0, [SELECT COUNT() FROM Order__c]);
    }

    @IsTest
    static void createOrderRejectsMalformedItemPayload() {
        String message = captureError('Alen', new List<ProductOrderController.OrderItemWrapper>{
            new ProductOrderController.OrderItemWrapper()
        });

        System.assert(message.startsWith('Invalid order item payload:'), 'Unexpected message: ' + message);
        System.assertEquals(0, [SELECT COUNT() FROM Order__c]);
    }

    @IsTest
    static void createOrderRejectsUnknownProduct() {
        Product__c product = newProduct('Apple', 10, 'Fruit');
        insert product;
        Id deletedProductId = product.Id;
        delete product;

        String message = captureError('Alen', new List<ProductOrderController.OrderItemWrapper>{
            newItem(deletedProductId, 1, 10)
        });

        System.assertEquals(
            'Some products in your cart are no longer available. Please refresh the page and try again.',
            message
        );
        System.assertEquals(0, [SELECT COUNT() FROM Order__c]);
    }

    @IsTest
    static void createOrderRejectsInvalidQuantities() {
        Product__c product = newProduct('Apple', 10, 'Fruit');
        insert product;

        String fractional = captureError('Alen', new List<ProductOrderController.OrderItemWrapper>{
            newItem(product.Id, 1.5, 10)
        });
        System.assertEquals('Quantity must be a whole number for every item.', fractional);

        String zero = captureError('Alen', new List<ProductOrderController.OrderItemWrapper>{
            newItem(product.Id, 0, 10)
        });
        System.assertEquals('Quantity must be at least 1 for every item.', zero);

        String negative = captureError('Alen', new List<ProductOrderController.OrderItemWrapper>{
            newItem(product.Id, -3, 10)
        });
        System.assertEquals('Quantity must be at least 1 for every item.', negative);

        String tooLarge = captureError('Alen', new List<ProductOrderController.OrderItemWrapper>{
            newItem(product.Id, 1000, 10)
        });
        System.assertEquals('Quantity cannot exceed 999 per item.', tooLarge);

        System.assertEquals(0, [SELECT COUNT() FROM Order__c]);
    }

    @IsTest
    static void createOrderRejectsTooManyItems() {
        Product__c product = newProduct('Apple', 10, 'Fruit');
        insert product;

        List<ProductOrderController.OrderItemWrapper> items = new List<ProductOrderController.OrderItemWrapper>();
        for (Integer i = 0; i < 101; i++) {
            items.add(newItem(product.Id, 1, 10));
        }

        String message = captureError('Alen', items);

        System.assertEquals('An order can contain at most 100 items.', message);
        System.assertEquals(0, [SELECT COUNT() FROM Order__c]);
    }
}
