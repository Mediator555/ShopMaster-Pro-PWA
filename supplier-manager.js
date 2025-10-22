// Supplier Credit Manager
class SupplierManager {
    constructor() {
        this.suppliers = [];
    }

    async addSupplier(supplierData) {
        const supplier = {
            id: Date.now(),
            ...supplierData,
            createdAt: new Date().toISOString()
        };
        this.suppliers.push(supplier);
        return supplier;
    }

    getSuppliers() {
        return this.suppliers;
    }
}