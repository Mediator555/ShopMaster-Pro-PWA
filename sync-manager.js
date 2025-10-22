// Advanced Offline Sync Manager
class SyncManager {
    constructor() {
        this.syncInterval = 30000;
        this.maxRetries = 3;
        this.isSyncing = false;
        this.db = null;
    }

    async init() {
        await this.createLocalDatabase();
        this.setupNetworkListener();
        this.startSyncInterval();
    }

    async createLocalDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('ShopMasterLocal', 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const stores = ['shops', 'products', 'sales', 'debts', 'suppliers', 'syncQueue'];
                
                stores.forEach(storeName => {
                    if (!db.objectStoreNames.contains(storeName)) {
                        const store = db.createObjectStore(storeName, { keyPath: 'id' });
                        if (storeName === 'products') {
                            store.createIndex('shop_id', 'shop_id', { unique: false });
                        }
                    }
                });
            };
        });
    }

    async saveLocally(tableName, data) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([tableName], 'readwrite');
            const store = tx.objectStore(tableName);
            const request = store.put(data);
            
            request.onsuccess = () => resolve(data);
            request.onerror = () => reject(request.error);
        });
    }

    async getLocalData(tableName, shopId = null) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([tableName], 'readonly');
            const store = tx.objectStore(tableName);
            const request = store.getAll();
            
            request.onsuccess = () => {
                let data = request.result;
                if (shopId) {
                    data = data.filter(item => item.shop_id === shopId);
                }
                resolve(data);
            };
            request.onerror = () => reject(request.error);
        });
    }

    setupNetworkListener() {
        window.addEventListener('online', () => {
            this.syncAllData();
        });
    }

    startSyncInterval() {
        setInterval(() => {
            if (navigator.onLine && !this.isSyncing) {
                this.syncAllData();
            }
        }, this.syncInterval);
    }

    async syncAllData() {
        if (this.isSyncing) return;
        this.isSyncing = true;
        
        try {
            console.log('Starting sync...');
            // Simulate sync - you'll implement actual Supabase sync here
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log('Sync completed');
        } catch (error) {
            console.error('Sync failed:', error);
        } finally {
            this.isSyncing = false;
        }
    }

    async queueForSync(tableName, operation, recordData, recordId) {
        console.log('Queued for sync:', { tableName, operation, recordId });
        // Implementation for actual sync queue
    }
}