// Mobile Money Payment Manager
class MoMoManager {
    constructor() {
        this.providers = {
            mtn: { name: 'MTN Mobile Money', code: '*182*' },
            airtel: { name: 'Airtel Money', code: '*185*' }
        };
    }

    showMoMoPaymentDialog(amount, onComplete) {
        // In real implementation, this would show a proper dialog
        const provider = Object.keys(this.providers)[0]; // Default to first provider
        const confirmed = confirm(`Pay ${amount.toLocaleString()} RWF via ${this.providers[provider].name}?`);
        
        if (confirmed && onComplete) {
            onComplete({ 
                success: true, 
                transactionId: 'MOMO_' + Date.now(),
                provider: provider
            });
        } else if (onComplete) {
            onComplete({ success: false });
        }
    }
}