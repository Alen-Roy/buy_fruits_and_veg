import { LightningElement, wire } from 'lwc';
import getProducts from '@salesforce/apex/ProductOrderController.getProducts';
import createOrder from '@salesforce/apex/ProductOrderController.createOrder';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class ProductOrder extends LightningElement {
    products = [];
    cartItems = [];
    currentView = 'browse';
    customerName = '';
    selectedCategory = 'All';
    searchTerm = '';
    confirmedOrderNumber;

    @wire(getProducts)
    wiredProducts({ data }) {
        if (data) {
            this.products = data;
        }
    }

    get filteredProducts() {
        let result = this.products;
        if (this.selectedCategory !== 'All') {
            result = result.filter((p) => p.Category__c === this.selectedCategory);
        }
        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            result = result.filter((p) => p.Name.toLowerCase().includes(term));
        }
        return result;
    }

    get cartCount() {
        return this.cartItems.reduce((total, item) => total + item.quantity, 0);
    }

    get cartTotal() {
        return this.cartItems.reduce((total, item) => total + item.subtotal, 0);
    }

    get cartButtonLabel() {
        return `View cart (${this.cartCount})`;
    }

    get isCartEmpty() {
        return this.cartItems.length === 0;
    }

    get allButtonVariant() {
        return this.selectedCategory === 'All' ? 'brand' : 'neutral';
    }

    get fruitButtonVariant() {
        return this.selectedCategory === 'Fruit' ? 'brand' : 'neutral';
    }

    get vegButtonVariant() {
        return this.selectedCategory === 'Vegetable' ? 'brand' : 'neutral';
    }

    get isCartView() {
        return this.currentView === 'cart';
    }

    get isConfirmation() {
        return this.currentView === 'confirmation';
    }

    handleAddToCart(event) {
        const productId = event.target.dataset.id;
        const existing = this.cartItems.find((item) => item.productId === productId);

        if (existing) {
            this.cartItems = this.cartItems.map((item) =>
                item.productId === productId
                    ? { ...item, quantity: item.quantity + 1, subtotal: (item.quantity + 1) * item.price }
                    : item
            );
        } else {
            const product = this.products.find((p) => p.Id === productId);
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
        const productId = event.target.dataset.id;
        this.cartItems = this.cartItems.map((item) =>
            item.productId === productId
                ? { ...item, quantity: item.quantity + 1, subtotal: (item.quantity + 1) * item.price }
                : item
        );
    }

    handleDecrement(event) {
        const productId = event.target.dataset.id;
        this.cartItems = this.cartItems
            .map((item) =>
                item.productId === productId
                    ? { ...item, quantity: item.quantity - 1, subtotal: (item.quantity - 1) * item.price }
                    : item
            )
            .filter((item) => item.quantity > 0);
    }

    handleRemove(event) {
        const productId = event.target.dataset.id;
        this.cartItems = this.cartItems.filter((item) => item.productId !== productId);
    }

    handleViewCart() {
        this.currentView = 'cart';
    }

    handleBackToShopping() {
        this.currentView = 'browse';
    }

    handleContinueShopping() {
        this.currentView = 'browse';
    }

    handleNameChange(event) {
        this.customerName = event.target.value;
    }

    handleCategoryFilter(event) {
        this.selectedCategory = event.target.dataset.category;
    }

    handleSearchChange(event) {
        this.searchTerm = event.target.value;
    }

    handlePlaceOrder() {
        if (!this.customerName) {
            this.showToast('Error', 'Enter your name', 'error');
            return;
        }
        if (this.cartItems.length === 0) {
            this.showToast('Error', 'Your cart is empty', 'error');
            return;
        }

        const items = this.cartItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.price
        }));

        createOrder({ customerName: this.customerName, items: items })
            .then((result) => {
                this.confirmedOrderNumber = result;
                this.currentView = 'confirmation';
                this.cartItems = [];
                this.customerName = '';
            })
            .catch((error) => {
                const message = (error && error.body && error.body.message)
                    ? error.body.message
                    : JSON.stringify(error);
                this.showToast('Error', message, 'error');
            });
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
