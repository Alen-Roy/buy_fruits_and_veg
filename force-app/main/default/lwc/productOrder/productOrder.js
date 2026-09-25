import { LightningElement, wire } from 'lwc';
import getProducts from '@salesforce/apex/ProductOrderController.getProducts';
import createOrder from '@salesforce/apex/ProductOrderController.createOrder';
import { refreshApex } from '@salesforce/apex';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

const MAX_NAME_LENGTH = 80;
const MAX_QUANTITY = 999;

export default class ProductOrder extends LightningElement {
    products = [];
    cartItems = [];
    currentView = 'browse';
    customerName = '';
    searchTerm = '';
    selectedCategory = 'All';
    confirmedOrderNumber;
    orderSummary;
    isLoading = true;
    loadError = false;
    isPlacingOrder = false;
    wiredProductsResult;

    @wire(getProducts)
    wiredProducts(value) {
        this.wiredProductsResult = value;
        if (value && value.data) {
            this.products = value.data;
            this.isLoading = false;
            this.loadError = false;
        } else if (value && value.error) {
            this.products = [];
            this.isLoading = false;
            this.loadError = true;
        }
    }

    get categoryOptions() {
        const counts = new Map();
        for (const product of this.products) {
            const category = product.Category__c || 'Other';
            counts.set(category, (counts.get(category) || 0) + 1);
        }
        const options = [
            {
                value: 'All',
                label: `All (${this.products.length})`,
                variant: this.selectedCategory === 'All' ? 'brand' : 'neutral'
            }
        ];
        for (const category of [...counts.keys()].sort()) {
            options.push({
                value: category,
                label: `${category} (${counts.get(category)})`,
                variant: this.selectedCategory === category ? 'brand' : 'neutral'
            });
        }
        return options;
    }

    get filteredProducts() {
        let result = this.products;
        if (this.selectedCategory !== 'All') {
            result = result.filter((p) => p.Category__c === this.selectedCategory);
        }
        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            result = result.filter(
                (p) =>
                    p.Name.toLowerCase().includes(term) ||
                    (p.Description__c && p.Description__c.toLowerCase().includes(term))
            );
        }
        return result;
    }

    get productCards() {
        return this.filteredProducts.map((product) => ({
            ...product,
            priceLabel: this.formatCurrency(product.Price__c)
        }));
    }

    get cartRows() {
        return this.cartItems.map((item) => ({
            ...item,
            priceLabel: this.formatCurrency(item.price),
            subtotalLabel: this.formatCurrency(item.subtotal)
        }));
    }

    get cartCount() {
        return this.cartItems.reduce((total, item) => total + item.quantity, 0);
    }

    get cartTotal() {
        return this.cartItems.reduce((total, item) => total + item.subtotal, 0);
    }

    get cartTotalLabel() {
        return this.formatCurrency(this.cartTotal);
    }

    get cartButtonLabel() {
        return `View cart (${this.cartCount})`;
    }

    get isCartEmpty() {
        return this.cartItems.length === 0;
    }

    get isCartView() {
        return this.currentView === 'cart';
    }

    get isConfirmation() {
        return this.currentView === 'confirmation';
    }

    get showProductGrid() {
        return !this.isLoading && !this.loadError && this.filteredProducts.length > 0;
    }

    get showEmptyProducts() {
        return !this.isLoading && !this.loadError && this.filteredProducts.length === 0;
    }

    get skeletonCards() {
        return Array.from({ length: 8 }, (_, index) => ({ key: index }));
    }

    get placeOrderLabel() {
        return this.isPlacingOrder ? 'Placing order...' : 'Place order';
    }

    get placeOrderDisabled() {
        return this.isPlacingOrder;
    }

    get confirmationSummary() {
        if (!this.orderSummary) {
            return '';
        }
        return this.orderSummary;
    }

    formatCurrency(value) {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 2
        }).format(value || 0);
    }

    handleAddToCart(event) {
        const productId = event.currentTarget.dataset.id;
        const product = this.products.find((p) => p.Id === productId);
        if (!product) {
            return;
        }

        const existing = this.cartItems.find((item) => item.productId === productId);
        if (existing) {
            if (existing.quantity >= MAX_QUANTITY) {
                this.showToast('Warning', `Maximum quantity is ${MAX_QUANTITY} per item`, 'warning');
                return;
            }
            this.cartItems = this.cartItems.map((item) =>
                item.productId === productId
                    ? { ...item, quantity: item.quantity + 1, subtotal: (item.quantity + 1) * item.price }
                    : item
            );
        } else {
            this.cartItems = [
                ...this.cartItems,
                {
                    productId: product.Id,
                    name: product.Name,
                    price: product.Price__c,
                    imageUrl: product.Image_URL__c,
                    quantity: 1,
                    subtotal: product.Price__c
                }
            ];
        }
    }

    handleIncrement(event) {
        const productId = event.currentTarget.dataset.id;
        const existing = this.cartItems.find((item) => item.productId === productId);
        if (!existing) {
            return;
        }
        if (existing.quantity >= MAX_QUANTITY) {
            this.showToast('Warning', `Maximum quantity is ${MAX_QUANTITY} per item`, 'warning');
            return;
        }
        this.cartItems = this.cartItems.map((item) =>
            item.productId === productId
                ? { ...item, quantity: item.quantity + 1, subtotal: (item.quantity + 1) * item.price }
                : item
        );
    }

    handleDecrement(event) {
        const productId = event.currentTarget.dataset.id;
        this.cartItems = this.cartItems
            .map((item) =>
                item.productId === productId
                    ? { ...item, quantity: item.quantity - 1, subtotal: (item.quantity - 1) * item.price }
                    : item
            )
            .filter((item) => item.quantity > 0);
    }

    handleRemove(event) {
        const productId = event.currentTarget.dataset.id;
        this.cartItems = this.cartItems.filter((item) => item.productId !== productId);
    }

    handleClearCart() {
        this.cartItems = [];
    }

    handleViewCart() {
        this.currentView = 'cart';
    }

    handleBackToShopping() {
        this.currentView = 'browse';
    }

    handleContinueShopping() {
        this.currentView = 'browse';
        this.confirmedOrderNumber = undefined;
        this.orderSummary = undefined;
    }

    handleNameChange(event) {
        this.customerName = event.target.value;
    }

    handleCategoryFilter(event) {
        this.selectedCategory = event.currentTarget.dataset.category;
    }

    handleSearchChange(event) {
        this.searchTerm = event.target.value;
    }

    handleClearFilters() {
        this.searchTerm = '';
        this.selectedCategory = 'All';
    }

    handleRetryProducts() {
        this.isLoading = true;
        this.loadError = false;
        refreshApex(this.wiredProductsResult);
    }

    async handlePlaceOrder() {
        if (this.isPlacingOrder) {
            return;
        }
        const name = (this.customerName || '').trim();
        if (!name) {
            this.showToast('Error', 'Enter your name', 'error');
            return;
        }
        if (name.length > MAX_NAME_LENGTH) {
            this.showToast('Error', `Name must be ${MAX_NAME_LENGTH} characters or fewer`, 'error');
            return;
        }
        if (this.cartItems.length === 0) {
            this.showToast('Error', 'Your cart is empty', 'error');
            return;
        }

        this.isPlacingOrder = true;
        try {
            const items = this.cartItems.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                price: item.price
            }));
            const orderNumber = await createOrder({ customerName: name, items });
            const itemCount = this.cartCount;
            this.orderSummary = `${itemCount} item${itemCount === 1 ? '' : 's'} · ${this.cartTotalLabel}`;
            this.confirmedOrderNumber = orderNumber;
            this.cartItems = [];
            this.customerName = '';
            this.currentView = 'confirmation';
        } catch (error) {
            this.showToast('Error', this.extractErrorMessage(error), 'error');
        } finally {
            this.isPlacingOrder = false;
        }
    }

    extractErrorMessage(error) {
        if (error) {
            if (Array.isArray(error.body) && error.body.length > 0) {
                return error.body[0].message;
            }
            if (error.body && typeof error.body.message === 'string') {
                return error.body.message;
            }
            if (typeof error.message === 'string') {
                return error.message;
            }
        }
        return 'Something went wrong. Please try again.';
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
