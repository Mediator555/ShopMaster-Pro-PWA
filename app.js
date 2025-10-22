// Enhanced ShopMaster App with Offline Sync
class ShopMasterApp {
    constructor() {
        this.currentUser = null;
        this.currentShop = null;
        this.syncManager = new SyncManager();
        this.supabase = null;
        this.calculator = new SimpleCalculator();
        this.calculatorVisible = false;
        this.currentSale = [];
        
        // Initialize external managers
        this.printer = new BluetoothPrinter();
        this.momoManager = new MoMoManager();
        this.supplierManager = new SupplierManager();
        
        this.init();
    }

    async init() {
        await this.initializeSupabase();
        await this.syncManager.init();
        this.setupNavigation();
        this.checkExistingSession();
        this.setupPWAFeatures();
        this.setupCalculatorClickOutside();
        this.setupEventListeners();
        
        console.log('ShopMaster App initialized successfully');
    }

    // Setup event listeners
    setupEventListeners() {
        // PIN input enter key support
        document.getElementById('pin-code')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.login();
            }
        });

        // Payment method change
        document.addEventListener('change', (e) => {
            if (e.target.id === 'payment-method') {
                this.toggleCustomerInfo(e.target.value);
            }
        });
    }

    // Initialize Supabase with YOUR credentials
    async initializeSupabase() {
        try {
            // Check if supabase is available
            if (typeof window.supabase === 'undefined') {
                console.warn('Supabase not loaded, using offline mode only');
                this.supabase = null;
                return;
            }

            this.supabase = window.supabase.createClient(
                'https://qkzvauzdsebvicraqdbn.supabase.co',
                'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFrenZhdXpkc2VidmljcmFxZGJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3ODU5MzEsImV4cCI6MjA3NjM2MTkzMX0.aBLPb6YJ65ZJVrOMN-8pKB9UEtA78z3NuIoPCAC3aA0'
            );
            
            // Test connection with timeout
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), 5000)
            );
            
            const connectionPromise = this.supabase.from('shops').select('count');
            
            const { data, error } = await Promise.race([connectionPromise, timeoutPromise]);
            
            if (error) throw error;
            
            console.log('Supabase connected successfully');
        } catch (error) {
            console.warn('Supabase connection failed, using offline mode:', error);
            this.supabase = null;
        }
    }

    // Enhanced login with offline support
    async login() {
        const pinInput = document.getElementById('pin-code');
        if (!pinInput) {
            this.showAlert('System error: PIN input not found');
            return;
        }

        const pin = pinInput.value;
        
        if (pin.length !== 4) {
            this.showAlert('Tanga PIN y\'imyenda 4');
            return;
        }

        try {
            let shop = null;
            
            // Try online first
            if (this.supabase) {
                try {
                    const { data, error } = await this.supabase
                        .from('shops')
                        .select('*')
                        .eq('pin_code', pin)
                        .single();

                    if (!error && data) {
                        shop = data;
                    }
                } catch (onlineError) {
                    console.warn('Online login failed:', onlineError);
                }
            }
            
            // Fallback to local data
            if (!shop) {
                shop = await this.findLocalShop(pin);
            }
            
            // Final fallback to test shops
            if (!shop) {
                shop = this.findTestShop(pin);
            }
            
            if (shop) {
                await this.initializeShopSession(shop);
                this.showApp();
            } else {
                this.showAlert('Ntago usanga boutique / PIN ntabwo ari yo. Gerageza 1234');
            }
            
        } catch (error) {
            console.error('Login error:', error);
            this.showAlert('Habaye ikosa, gerageza nanone');
        }
    }

    // Find shop in test data (fallback)
    findTestShop(pin) {
        const testShops = [
            { 
                id: 1, 
                shop_name: "Test Shop Kigali", 
                owner_name: "Jean Bosco", 
                pin_code: "1234", 
                phone: "250788123456" 
            }
        ];
        return testShops.find(shop => shop.pin_code === pin);
    }

    // Find shop in local database
    async findLocalShop(pin) {
        try {
            const localShops = await this.syncManager.getLocalData('shops');
            return localShops?.find(shop => shop.pin_code === pin);
        } catch (error) {
            console.warn('Error finding local shop:', error);
            return null;
        }
    }

    // Initialize shop session
    async initializeShopSession(shop) {
        this.currentShop = shop;
        this.currentUser = { shop_id: shop.id, shop_name: shop.shop_name };
        
        // Save to localStorage for persistence
        localStorage.setItem('currentShop', JSON.stringify(shop));
        
        // Preload shop data
        await this.preloadShopData();
    }

    // Preload essential data
    async preloadShopData() {
        if (!this.currentShop) return;
        
        try {
            const shopId = this.currentShop.id;
            const tables = ['products', 'debts', 'sales'];
            
            for (const table of tables) {
                const data = await this.syncManager.getLocalData(table, shopId);
                if (!data || data.length === 0) {
                    console.log(`No local data found for ${table}, will sync when online`);
                }
            }
            
            // Trigger background sync
            this.syncManager.syncAllData().catch(error => {
                console.warn('Background sync failed:', error);
            });
        } catch (error) {
            console.warn('Preload data error:', error);
        }
    }

    // Enhanced save methods with sync
    async saveProduct(productData) {
        try {
            const productId = productData.id || generateId();
            const product = {
                ...productData,
                id: productId,
                shop_id: this.currentShop.id,
                updated_at: new Date().toISOString()
            };

            // Save locally immediately
            await this.syncManager.saveLocally('products', product);
            
            // Queue for sync
            await this.syncManager.queueForSync(
                'products', 
                productData.id ? 'update' : 'insert',
                product,
                productId
            );

            return productId;
        } catch (error) {
            console.error('Error saving product:', error);
            throw error;
        }
    }

    async saveSale(saleData) {
        try {
            const saleId = generateId();
            const sale = {
                ...saleData,
                id: saleId,
                shop_id: this.currentShop.id,
                receipt_number: 'RCP' + Date.now(),
                sale_date: new Date().toISOString(),
                sync_status: 'pending'
            };

            // Save locally
            await this.syncManager.saveLocally('sales', sale);
            
            // Queue for sync
            await this.syncManager.queueForSync(
                'sales',
                'insert',
                sale,
                saleId
            );

            // Update stock levels
            for (const item of saleData.items) {
                await this.updateProductStock(item.product_id, -item.quantity);
            }

            return saleId;
        } catch (error) {
            console.error('Error saving sale:', error);
            throw error;
        }
    }

    async updateProductStock(productId, quantityChange) {
        try {
            const products = await this.syncManager.getLocalData('products');
            const product = products.find(p => p.id === productId);
            
            if (product) {
                product.current_stock = (product.current_stock || 0) + quantityChange;
                product.updated_at = new Date().toISOString();
                
                await this.syncManager.saveLocally('products', product);
                await this.syncManager.queueForSync(
                    'products',
                    'update',
                    { current_stock: product.current_stock },
                    productId
                );
            }
        } catch (error) {
            console.error('Error updating stock:', error);
            throw error;
        }
    }

    // POS Functions
    addToSale(product) {
        const existingItem = this.currentSale.find(item => item.id === product.id);
        
        if (existingItem) {
            if (existingItem.quantity < product.stock) {
                existingItem.quantity += 1;
            } else {
                this.showAlert(`Only ${product.stock} items left in stock!`);
                return;
            }
        } else {
            if (product.stock > 0) {
                this.currentSale.push({
                    ...product,
                    quantity: 1
                });
            } else {
                this.showAlert('Product out of stock!');
                return;
            }
        }
        
        this.updatePOSDisplay();
    }

    removeFromSale(productId) {
        this.currentSale = this.currentSale.filter(item => item.id !== productId);
        this.updatePOSDisplay();
    }

    updatePOSDisplay() {
        const saleItems = document.getElementById('sale-items');
        const saleTotal = document.getElementById('sale-total');
        
        if (saleItems) {
            saleItems.innerHTML = this.currentSale.length === 0 ? 
                '<p style="text-align: center; color: #7f8c8d; padding: 20px;">No items added yet</p>' : 
                this.renderSaleItems();
        }
        
        if (saleTotal) {
            saleTotal.textContent = this.calculateSaleTotal().toLocaleString();
        }
    }

    renderSaleItems() {
        return this.currentSale.map(item => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #eee;">
                <div>
                    <strong>${item.name}</strong><br>
                    <small>${item.price} RWF x ${item.quantity}</small>
                </div>
                <div>
                    <strong>${(item.price * item.quantity).toLocaleString()} RWF</strong>
                    <button onclick="app.removeFromSale(${item.id})" style="margin-left: 10px; padding: 5px 10px; background: #e74c3c;">×</button>
                </div>
            </div>
        `).join('');
    }

    calculateSaleTotal() {
        return this.currentSale.reduce((total, item) => total + (item.price * item.quantity), 0);
    }

    toggleCustomerInfo(paymentMethod) {
        const customerInfo = document.getElementById('customer-info');
        if (customerInfo) {
            customerInfo.style.display = paymentMethod === 'credit' ? 'block' : 'none';
        }
    }

    async processSale() {
        if (this.currentSale.length === 0) {
            this.showAlert('Please add products to the sale');
            return;
        }

        const paymentMethod = document.getElementById('payment-method')?.value || 'cash';
        const total = this.calculateSaleTotal();

        // Validate credit sale
        if (paymentMethod === 'credit') {
            const customerName = document.getElementById('customer-name')?.value;
            if (!customerName) {
                this.showAlert('Please enter customer name for credit sale');
                return;
            }
        }

        try {
            const saleId = await this.saveSale({
                items: this.currentSale,
                total: total,
                paymentMethod: paymentMethod
            });

            this.showAlert(`✅ Sale completed successfully!\nTotal: ${total.toLocaleString()} RWF\nPayment: ${paymentMethod}`);
            
            // Store for printing
            window.lastSale = {
                id: saleId,
                items: [...this.currentSale],
                total: total,
                paymentMethod: paymentMethod,
                date: new Date().toLocaleDateString('en-RW')
            };
            
            this.clearSale();
            this.loadPage('dashboard');
            
        } catch (error) {
            this.showAlert('Error processing sale: ' + error.message);
        }
    }

    clearSale() {
        this.currentSale = [];
        this.updatePOSDisplay();
    }

    // Calculator methods
    showCalculator() {
        const calculator = document.getElementById('floating-calculator');
        if (calculator) {
            calculator.style.display = 'block';
            this.calculatorVisible = true;
        }
    }

    hideCalculator() {
        const calculator = document.getElementById('floating-calculator');
        if (calculator) {
            calculator.style.display = 'none';
            this.calculatorVisible = false;
        }
    }

    toggleCalculator() {
        if (this.calculatorVisible) {
            this.hideCalculator();
        } else {
            this.showCalculator();
        }
    }

    setupCalculatorClickOutside() {
        document.addEventListener('click', (e) => {
            const calculator = document.getElementById('floating-calculator');
            const trigger = document.querySelector('.floating-trigger');
            
            if (this.calculatorVisible && 
                calculator && 
                !calculator.contains(e.target) && 
                trigger && 
                !trigger.contains(e.target)) {
                this.hideCalculator();
            }
        });
    }

    // Setup PWA features for app-like experience
    setupPWAFeatures() {
        // Prevent zoom on input focus (iOS)
        document.addEventListener('touchstart', function() {}, { passive: true });
        
        // Prevent bounce/scrolling at boundaries
        document.addEventListener('touchmove', function(e) {
            if (e.scale !== 1) { e.preventDefault(); }
        }, { passive: false });
        
        // Add to homescreen prompt
        this.setupAddToHomeScreen();
    }

    setupAddToHomeScreen() {
        let deferredPrompt;
        
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            
            // Show install button (optional)
            this.showInstallButton();
        });
        
        window.addEventListener('appinstalled', () => {
            console.log('PWA installed successfully');
            deferredPrompt = null;
        });
    }

    showInstallButton() {
        // You can add a subtle install prompt
        const installBtn = document.createElement('button');
        installBtn.textContent = '📱 Add to Home Screen';
        installBtn.className = 'install-btn';
        installBtn.onclick = () => this.promptInstall();
        installBtn.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 10000;
            background: #2ecc71;
            color: white;
            border: none;
            padding: 10px;
            border-radius: 5px;
            cursor: pointer;
        `;
        
        document.body.appendChild(installBtn);
    }

    async promptInstall() {
        if (window.deferredPrompt) {
            window.deferredPrompt.prompt();
            const { outcome } = await window.deferredPrompt.userChoice;
            
            if (outcome === 'accepted') {
                console.log('User accepted install');
            }
            window.deferredPrompt = null;
        }
    }

    // Navigation and Page Management
    setupNavigation() {
        // This will be handled by the HTML onclick events
        console.log('Navigation setup complete');
    }

    async loadPage(page) {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) {
            console.error('Main content element not found');
            return;
        }

        // Show loading
        mainContent.innerHTML = '<div class="loading">Loading...</div>';

        try {
            let html = '';
            
            switch(page) {
                case 'dashboard':
                    html = await this.renderDashboard();
                    break;
                case 'pos':
                    html = await this.renderPOS();
                    break;
                case 'inventory':
                    html = await this.renderInventory();
                    break;
                case 'debts':
                    html = await this.renderDebts();
                    break;
                case 'admin':
                    html = await this.renderAdmin();
                    break;
                default:
                    html = await this.renderDashboard();
            }
            
            mainContent.innerHTML = html;
            this.attachPageEvents(page);
            
        } catch (error) {
            console.error('Error loading page:', error);
            mainContent.innerHTML = `
                <div class="error">
                    <h3>Failed to load page</h3>
                    <p>Please check your connection</p>
                    <button onclick="app.loadPage('${page}')">Retry</button>
                </div>
            `;
        }
    }

    // Page rendering methods (simplified versions)
    async renderDashboard() {
        const products = await this.syncManager.getLocalData('products') || [];
        const sales = await this.syncManager.getLocalData('sales') || [];
        const debts = await this.syncManager.getLocalData('debts') || [];
        
        const totalSales = sales.reduce((sum, sale) => sum + (sale.total || 0), 0);
        const totalDebts = debts.reduce((sum, debt) => sum + (debt.amount || 0), 0);
        const lowStockProducts = products.filter(p => (p.stock || 0) < 10).length;

        return `
            <div class="card">
                <h2>📊 Dashboard</h2>
                <p>Welcome to <strong>${this.currentShop?.shop_name || 'Shop'}</strong></p>
            </div>
            
            <div class="card">
                <h3>📈 Quick Stats</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px;">
                    <div style="text-align: center; padding: 15px; background: #e8f5e8; border-radius: 8px;">
                        <div style="font-size: 24px; font-weight: bold; color: #2ecc71;">${products.length}</div>
                        <div>Total Products</div>
                    </div>
                    <div style="text-align: center; padding: 15px; background: #e8f4ff; border-radius: 8px;">
                        <div style="font-size: 24px; font-weight: bold; color: #3498db;">${totalSales.toLocaleString()} RWF</div>
                        <div>Total Sales</div>
                    </div>
                    <div style="text-align: center; padding: 15px; background: #fff3e8; border-radius: 8px;">
                        <div style="font-size: 24px; font-weight: bold; color: #e67e22;">${totalDebts.toLocaleString()} RWF</div>
                        <div>Pending Debts</div>
                    </div>
                    <div style="text-align: center; padding: 15px; background: #ffe8e8; border-radius: 8px;">
                        <div style="font-size: 24px; font-weight: bold; color: #e74c3c;">${lowStockProducts}</div>
                        <div>Low Stock Items</div>
                    </div>
                </div>
            </div>

            <div class="card">
                <h3>🚀 Quick Actions</h3>
                <button onclick="app.loadPage('pos')" style="margin: 5px; width: auto;">💰 New Sale</button>
                <button onclick="app.loadPage('inventory')" style="margin: 5px; width: auto;">📦 Manage Stock</button>
                <button onclick="app.loadPage('debts')" style="margin: 5px; width: auto;">👥 Track Debts</button>
            </div>
        `;
    }

    async renderPOS() {
        const products = await this.syncManager.getLocalData('products') || [];
        
        return `
            <div class="card">
                <h2>💰 Point of Sale</h2>
                <p>Add products to cart and process sales</p>
            </div>

            <div class="card">
                <h3>🛒 Current Sale</h3>
                <div id="sale-items" style="min-height: 100px; margin: 15px 0;">
                    ${this.currentSale.length === 0 ? 
                        '<p style="text-align: center; color: #7f8c8d; padding: 20px;">No items added yet</p>' : 
                        this.renderSaleItems()}
                </div>
                <div style="border-top: 2px solid #eee; padding-top: 15px;">
                    <h3>Total: <span id="sale-total">${this.calculateSaleTotal().toLocaleString()}</span> RWF</h3>
                </div>
                
                <div style="margin-top: 15px;">
                    <select id="payment-method" style="width: 100%; padding: 10px; margin: 10px 0;">
                        <option value="cash">💵 Cash</option>
                        <option value="momo">📱 Mobile Money</option>
                        <option value="credit">📝 Credit</option>
                    </select>
                    
                    <div id="customer-info" style="display: none;">
                        <input type="text" id="customer-name" placeholder="Customer Name" style="width: 100%; padding: 10px; margin: 5px 0;">
                        <input type="tel" id="customer-phone" placeholder="Phone Number" style="width: 100%; padding: 10px; margin: 5px 0;">
                    </div>

                    <button onclick="app.processSale()" style="background: #2ecc71; margin: 5px 0;">✅ Complete Sale</button>
                    <button onclick="app.clearSale()" style="background: #e74c3c; margin: 5px 0;">🗑️ Clear Sale</button>
                </div>
            </div>

            <div class="card">
                <h3>📦 Products</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    ${products.map(product => `
                        <div style="border: 1px solid #ddd; padding: 15px; border-radius: 8px; text-align: center; cursor: pointer;" 
                             onclick="app.addToSale(${JSON.stringify(product).replace(/"/g, '&quot;')})">
                            <div style="font-weight: bold;">${product.name}</div>
                            <div style="color: #2ecc71; font-weight: bold;">${(product.price || 0).toLocaleString()} RWF</div>
                            <div style="color: #7f8c8d; font-size: 12px;">Stock: ${product.stock || 0}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    async renderInventory() {
        // Simplified inventory rendering
        return `
            <div class="card">
                <h2>📦 Inventory Management</h2>
                <p>Inventory page - to be implemented</p>
            </div>
        `;
    }

    async renderDebts() {
        return `
            <div class="card">
                <h2>👥 Debt Management</h2>
                <p>Debts page - to be implemented</p>
            </div>
        `;
    }

    async renderAdmin() {
        return `
            <div class="card">
                <h2>⚙️ Shop Settings</h2>
                <p>Settings page - to be implemented</p>
            </div>
        `;
    }

    attachPageEvents(page) {
        // Attach event listeners for the current page
        if (page === 'pos') {
            const paymentMethod = document.getElementById('payment-method');
            if (paymentMethod) {
                paymentMethod.addEventListener('change', (e) => {
                    this.toggleCustomerInfo(e.target.value);
                });
            }
        }
    }

    checkExistingSession() {
        const savedShop = localStorage.getItem('currentShop');
        if (savedShop) {
            try {
                this.currentShop = JSON.parse(savedShop);
                this.showApp();
            } catch (error) {
                console.error('Error parsing saved shop:', error);
                localStorage.removeItem('currentShop');
            }
        }
    }

    // Utility methods
    showAlert(message) {
        alert(message);
    }

    showApp() {
        document.getElementById('login-screen')?.classList.remove('active');
        document.getElementById('app-screen')?.classList.add('active');
        this.loadPage('dashboard');
    }

    logout() {
        this.currentShop = null;
        this.currentUser = null;
        this.currentSale = [];
        localStorage.removeItem('currentShop');
        
        document.getElementById('app-screen')?.classList.remove('active');
        document.getElementById('login-screen')?.classList.add('active');
        document.getElementById('pin-code').value = '';
    }
}

// Missing class implementations
class SyncManager {
    constructor() {
        this.dbName = 'ShopMasterDB';
        this.version = 1;
    }

    async init() {
        console.log('SyncManager initialized (offline mode)');
        return Promise.resolve();
    }

    async getLocalData(table, shopId = null) {
        try {
            const key = `shopmaster_${table}`;
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.warn(`Error getting local data for ${table}:`, error);
            return [];
        }
    }

    async saveLocally(table, item) {
        try {
            const key = `shopmaster_${table}`;
            const existingData = await this.getLocalData(table);
            const existingIndex = existingData.findIndex(i => i.id === item.id);
            
            if (existingIndex >= 0) {
                existingData[existingIndex] = item;
            } else {
                existingData.push(item);
            }
            
            localStorage.setItem(key, JSON.stringify(existingData));
            return true;
        } catch (error) {
            console.error(`Error saving locally to ${table}:`, error);
            return false;
        }
    }

    async queueForSync(table, operation, data, id) {
        console.log(`Queued for sync: ${table}.${operation}`, data);
        // In a real implementation, this would queue for background sync
        return Promise.resolve();
    }

    async syncAllData() {
        console.log('Syncing all data...');
        // Background sync implementation would go here
        return Promise.resolve();
    }
}

class SimpleCalculator {
    constructor() {
        this.currentInput = '0';
        this.previousInput = '';
        this.operator = null;
        this.waitingForNewInput = false;
    }

    input(number) {
        if (this.waitingForNewInput) {
            this.currentInput = number;
            this.waitingForNewInput = false;
        } else {
            this.currentInput = this.currentInput === '0' ? number : this.currentInput + number;
        }
        this.updateDisplay();
    }

    operation(op) {
        if (this.operator !== null && !this.waitingForNewInput) {
            this.calculate();
        }
        
        this.previousInput = this.currentInput;
        this.operator = op;
        this.waitingForNewInput = true;
    }

    calculate() {
        if (this.operator === null || this.waitingForNewInput) return;

        const prev = parseFloat(this.previousInput);
        const current = parseFloat(this.currentInput);
        
        if (isNaN(prev) || isNaN(current)) return;

        let result;
        switch (this.operator) {
            case '+': result = prev + current; break;
            case '-': result = prev - current; break;
            case '*': result = prev * current; break;
            case '/': result = current !== 0 ? prev / current : 'Error'; break;
            default: return;
        }

        this.currentInput = result.toString();
        this.operator = null;
        this.previousInput = '';
        this.waitingForNewInput = true;
        this.updateDisplay();
    }

    clear() {
        this.currentInput = '0';
        this.previousInput = '';
        this.operator = null;
        this.waitingForNewInput = false;
        this.updateDisplay();
    }

    backspace() {
        if (this.currentInput.length > 1) {
            this.currentInput = this.currentInput.slice(0, -1);
        } else {
            this.currentInput = '0';
        }
        this.updateDisplay();
    }

    updateDisplay() {
        const display = document.getElementById('calc-display');
        if (display) {
            display.value = this.currentInput;
        }
    }
}

// Global functions for HTML onclick
window.login = () => app.login();
window.toggleCalculator = () => app.toggleCalculator();
window.handlePinKeypress = (event) => {
    if (event.key === 'Enter') {
        app.login();
    }
};

// Calculator global functions
window.calculatorInput = (num) => app.calculator.input(num);
window.calculatorOperation = (op) => app.calculator.operation(op);
window.calculatorCalculate = () => app.calculator.calculate();
window.calculatorClear = () => app.calculator.clear();
window.calculatorBackspace = () => app.calculator.backspace();
window.hideCalculator = () => app.hideCalculator();

// Utility function
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ShopMasterApp();
});

// Export for module usage if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ShopMasterApp, SyncManager, SimpleCalculator };
}