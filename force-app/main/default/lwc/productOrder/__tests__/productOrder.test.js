import { createElement } from 'lwc';
import ProductOrder from 'c/productOrder';
import getProducts from '@salesforce/apex/ProductOrderController.getProducts';
import createOrder from '@salesforce/apex/ProductOrderController.createOrder';

jest.mock(
    '@salesforce/apex/ProductOrderController.getProducts',
    () => {
        const { createApexTestWireAdapter } = require('@salesforce/sfdx-lwc-jest');
        return {
            default: createApexTestWireAdapter(jest.fn()),
        };
    },
    { virtual: true }
);

jest.mock(
    '@salesforce/apex/ProductOrderController.createOrder',
    () => ({
        default: jest.fn(),
    }),
    { virtual: true }
);

const mockProducts = [
    {
        Id: 'a01mock001',
        Name: 'Apple',
        Price__c: 20,
        Category__c: 'Fruit',
        Description__c: 'Juicy Apple',
        Image_URL__c: 'https://example.com/apple.png',
    },
    {
        Id: 'a01mock002',
        Name: 'Banana',
        Price__c: 40,
        Category__c: 'Fruit',
        Description__c: 'Fresh banana',
        Image_URL__c: 'https://example.com/banana.png',
    },
    {
        Id: 'a01mock003',
        Name: 'Carrot',
        Price__c: 5,
        Category__c: 'Vegetable',
        Description__c: 'Crunchy carrot',
        Image_URL__c: 'https://example.com/carrot.png',
    },
];

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function createElementWithWire(data) {
    const element = createElement('c-product-order', { is: ProductOrder });
    document.body.appendChild(element);
    if (data !== undefined) {
        getProducts.emit(data);
    }
    return element;
}

function findButton(element, label) {
    return [...element.shadowRoot.querySelectorAll('lightning-button')].find(
        (btn) => btn.label === label
    );
}

function findButtonStartingWith(element, prefix) {
    return [...element.shadowRoot.querySelectorAll('lightning-button')].find((btn) =>
        (btn.label || '').startsWith(prefix)
    );
}

function findInput(element, label) {
    return [...element.shadowRoot.querySelectorAll('lightning-input')].find(
        (input) => input.label === label
    );
}

function click(el) {
    el.dispatchEvent(new CustomEvent('click', { bubbles: true }));
}

function setValue(input, value) {
    input.value = value;
    input.dispatchEvent(new CustomEvent('change', { bubbles: true }));
}

function collectToasts(element) {
    const events = [];
    element.addEventListener('lightning__showtoast', (e) => events.push(e.detail));
    return events;
}

describe('c-product-order', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('shows a loading skeleton before wire data arrives', async () => {
        const element = createElementWithWire(undefined);
        await flush();

        const skeletons = element.shadowRoot.querySelectorAll('.skeleton-card');
        expect(skeletons.length).toBe(8);
        expect(element.shadowRoot.querySelector('.product-grid')).not.toBeNull();
    });

    it('renders products with formatted prices, category chips, and descriptions', async () => {
        const element = createElementWithWire(mockProducts);
        await flush();

        const addToCartButtons = [
            ...element.shadowRoot.querySelectorAll('lightning-button'),
        ].filter((btn) => btn.label === 'Add to cart');
        expect(addToCartButtons.length).toBe(3);

        expect(element.shadowRoot.textContent).toContain('₹20.00');
        expect(element.shadowRoot.textContent).toContain('₹40.00');
        expect(element.shadowRoot.textContent).toContain('Juicy Apple');

        const chipLabels = [
            ...element.shadowRoot.querySelectorAll('.filter-bar lightning-button'),
        ].map((btn) => btn.label);
        expect(chipLabels).toEqual(['All (3)', 'Fruit (2)', 'Vegetable (1)']);
    });

    it('renders an empty state when no products are returned', async () => {
        const element = createElementWithWire([]);
        await flush();

        expect(element.shadowRoot.textContent).toContain('No products found');
        expect(findButton(element, 'Clear filters')).toBeDefined();
    });

    it('renders an error state when the wire fails and offers retry', async () => {
        const element = createElementWithWire(undefined);
        getProducts.emitError({ body: { message: 'boom' } });
        await flush();

        expect(element.shadowRoot.textContent).toContain("We couldn't load products.");
        expect(findButton(element, 'Retry')).toBeDefined();
    });

    it('filters products by search term', async () => {
        const element = createElementWithWire(mockProducts);
        await flush();

        setValue(findInput(element, 'Search products'), 'apple');
        await flush();

        const addToCartButtons = [
            ...element.shadowRoot.querySelectorAll('lightning-button'),
        ].filter((btn) => btn.label === 'Add to cart');
        expect(addToCartButtons.length).toBe(1);
        expect(element.shadowRoot.textContent).toContain('Juicy Apple');
        expect(element.shadowRoot.textContent).not.toContain('Fresh banana');

        setValue(findInput(element, 'Search products'), 'zzzz');
        await flush();
        expect(element.shadowRoot.textContent).toContain('No products found');

        click(findButton(element, 'Clear filters'));
        await flush();
        const restored = [
            ...element.shadowRoot.querySelectorAll('lightning-button'),
        ].filter((btn) => btn.label === 'Add to cart');
        expect(restored.length).toBe(3);
    });

    it('filters products by category chips', async () => {
        const element = createElementWithWire(mockProducts);
        await flush();

        const chip = [...element.shadowRoot.querySelectorAll('.filter-bar lightning-button')].find(
            (btn) => btn.label === 'Vegetable (1)'
        );
        click(chip);
        await flush();

        const addToCartButtons = [
            ...element.shadowRoot.querySelectorAll('lightning-button'),
        ].filter((btn) => btn.label === 'Add to cart');
        expect(addToCartButtons.length).toBe(1);
        expect(element.shadowRoot.textContent).toContain('Crunchy carrot');
    });

    it('adds a product to the cart and updates the badge', async () => {
        const element = createElementWithWire(mockProducts);
        await flush();

        const addToCartButtons = [
            ...element.shadowRoot.querySelectorAll('lightning-button'),
        ].filter((btn) => btn.label === 'Add to cart');
        click(addToCartButtons[0]);
        await flush();

        expect(findButtonStartingWith(element, 'View cart (1)')).toBeDefined();
    });

    it('shows a formatted cart total and can be cleared', async () => {
        const element = createElementWithWire(mockProducts);
        await flush();

        const addToCartButtons = [
            ...element.shadowRoot.querySelectorAll('lightning-button'),
        ].filter((btn) => btn.label === 'Add to cart');
        click(addToCartButtons[0]);
        await flush();

        click(findButtonStartingWith(element, 'View cart'));
        await flush();

        expect(element.shadowRoot.textContent).toContain('Total: ₹20.00');
        expect(findInput(element, 'Your name')).toBeDefined();
        expect(findButton(element, 'Place order')).toBeDefined();

        click(findButton(element, 'Clear cart'));
        await flush();
        expect(element.shadowRoot.textContent).toContain('Your cart is empty.');
    });

    it('increments, decrements, and removes cart items', async () => {
        const element = createElementWithWire(mockProducts);
        await flush();

        const addToCartButtons = [
            ...element.shadowRoot.querySelectorAll('lightning-button'),
        ].filter((btn) => btn.label === 'Add to cart');
        click(addToCartButtons[0]);
        click(addToCartButtons[1]);
        await flush();

        expect(findButtonStartingWith(element, 'View cart (2)')).toBeDefined();

        click(findButtonStartingWith(element, 'View cart'));
        await flush();

        const quantities = () =>
            [...element.shadowRoot.querySelectorAll('.qty-value')].map((el) => el.textContent);
        expect(quantities()).toEqual(['1', '1']);

        const icon = (ariaLabel) =>
            [...element.shadowRoot.querySelectorAll('lightning-button-icon')].find(
                (btn) => btn.ariaLabel === ariaLabel || btn.getAttribute('aria-label') === ariaLabel
            );

        click(icon('Increase quantity'));
        await flush();
        expect(quantities()).toEqual(['2', '1']);

        click(icon('Increase quantity'));
        await flush();
        expect(quantities()).toEqual(['3', '1']);

        click(icon('Decrease quantity'));
        await flush();
        expect(quantities()).toEqual(['2', '1']);

        click(icon('Remove item'));
        await flush();
        expect(quantities()).toEqual(['1']);

        click(icon('Remove item'));
        await flush();
        expect(quantities()).toEqual([]);
        expect(element.shadowRoot.textContent).toContain('Your cart is empty.');
    });

    it('blocks placing an order without a customer name', async () => {
        const element = createElementWithWire(mockProducts);
        const toasts = collectToasts(element);
        await flush();

        const addToCartButtons = [
            ...element.shadowRoot.querySelectorAll('lightning-button'),
        ].filter((btn) => btn.label === 'Add to cart');
        click(addToCartButtons[0]);
        await flush();
        click(findButtonStartingWith(element, 'View cart'));
        await flush();

        click(findButton(element, 'Place order'));
        await flush();

        expect(createOrder).not.toHaveBeenCalled();
        expect(toasts).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ message: 'Enter your name', variant: 'error' }),
            ])
        );
    });

    it('places an order, clears the cart, and shows the confirmation', async () => {
        createOrder.mockResolvedValue('ORD-0042');
        const element = createElementWithWire(mockProducts);
        await flush();

        const addToCartButtons = [
            ...element.shadowRoot.querySelectorAll('lightning-button'),
        ].filter((btn) => btn.label === 'Add to cart');
        click(addToCartButtons[0]);
        await flush();
        click(findButtonStartingWith(element, 'View cart'));
        await flush();

        setValue(findInput(element, 'Your name'), 'Alen');
        await flush();
        click(findButton(element, 'Place order'));
        await flush();
        await flush();

        expect(createOrder).toHaveBeenCalledWith({
            customerName: 'Alen',
            items: [{ productId: 'a01mock001', quantity: 1, price: 20 }],
        });

        expect(element.shadowRoot.textContent).toContain('Thank you!');
        expect(element.shadowRoot.querySelector('.confirmation-text strong').textContent).toBe(
            'ORD-0042'
        );
        expect(element.shadowRoot.querySelector('.confirmation-summary').textContent).toBe(
            '1 item · ₹20.00'
        );

        click(findButton(element, 'Continue shopping'));
        await flush();
        expect(findButtonStartingWith(element, 'View cart (0)')).toBeDefined();
    });

    it('guards against double submission while an order is in flight', async () => {
        let resolveOrder;
        createOrder.mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveOrder = resolve;
                })
        );

        const element = createElementWithWire(mockProducts);
        await flush();

        const addToCartButtons = [
            ...element.shadowRoot.querySelectorAll('lightning-button'),
        ].filter((btn) => btn.label === 'Add to cart');
        click(addToCartButtons[0]);
        await flush();
        click(findButtonStartingWith(element, 'View cart'));
        await flush();
        setValue(findInput(element, 'Your name'), 'Alen');
        await flush();

        click(findButton(element, 'Place order'));
        await flush();

        const pendingButton = findButton(element, 'Placing order...');
        expect(pendingButton).toBeDefined();
        expect(pendingButton.disabled).toBe(true);

        click(pendingButton);
        await flush();
        expect(createOrder).toHaveBeenCalledTimes(1);

        resolveOrder('ORD-0043');
        await flush();
        await flush();
        expect(element.shadowRoot.querySelector('.confirmation-text strong').textContent).toBe(
            'ORD-0043'
        );
    });
});
