// API Client for Restaurant Order System
// This file handles all API calls to the backend

const API_BASE_URL = window.location.origin;
const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

class APIClient {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
    }

    // WebSocket connection
    connectWebSocket(onMessage) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return;
        }

        try {
            this.ws = new WebSocket(WS_URL);

            this.ws.onopen = () => {
                console.log('✅ WebSocket connected');
                this.reconnectAttempts = 0;
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (onMessage) {
                        onMessage(data);
                    }
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };

            this.ws.onclose = () => {
                console.log('WebSocket disconnected');
                this.attemptReconnect(onMessage);
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        } catch (error) {
            console.error('Failed to create WebSocket:', error);
            this.attemptReconnect(onMessage);
        }
    }

    attemptReconnect(onMessage) {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            setTimeout(() => {
                this.connectWebSocket(onMessage);
            }, this.reconnectDelay);
        }
    }

    disconnectWebSocket() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    // API calls
    async request(endpoint, options = {}) {
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers,
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`API request failed: ${endpoint}`, error);
            throw error;
        }
    }

    // Menu
    async getMenu() {
        return this.request('/api/menu');
    }

    async getAllMenu() {
        return this.request('/api/menu?all=true');
    }

    async addMenuItem(data) {
        return this.request('/api/menu', { method: 'POST', body: JSON.stringify(data) });
    }

    async updateMenuItem(id, data) {
        return this.request(`/api/menu/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    }

    async toggleMenuAvailability(id, is_available) {
        return this.request(`/api/menu/${id}/availability`, { method: 'PATCH', body: JSON.stringify({ is_available }) });
    }

    async deleteMenuItem(id) {
        return this.request(`/api/menu/${id}`, { method: 'DELETE' });
    }

    // Orders
    async getOrders(status = 'all', date = null) {
        let url = `/api/orders?status=${status}`;
        if (date) url += `&date=${date}`;
        return this.request(url);
    }

    async getOrder(orderId) {
        return this.request(`/api/orders/${orderId}`);
    }

    async getOrdersByTable(tableNumber) {
        return this.request(`/api/orders/table/${tableNumber}`);
    }

    async createOrder(orderData) {
        return this.request('/api/orders', {
            method: 'POST',
            body: JSON.stringify(orderData),
        });
    }

    async updateOrderStatus(orderId, status) {
        return this.request(`/api/orders/${orderId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status }),
        });
    }

    async deleteOrder(orderId) {
        return this.request(`/api/orders/${orderId}`, {
            method: 'DELETE',
        });
    }

    async updateOrderItems(orderId, items, total) {
        return this.request(`/api/orders/${orderId}/items`, {
            method: 'PATCH',
            body: JSON.stringify({ items, total }),
        });
    }

    async deleteCompletedOrders() {
        return this.request('/api/orders/completed/all', {
            method: 'DELETE',
        });
    }

    // Statistics
    async getStatistics() {
        return this.request('/api/statistics');
    }

    async getSalesStats(period = 'daily') {
        return this.request(`/api/sales-stats?period=${period}`);
    }

    async getHourlyStats(period = 'daily') {
        return this.request(`/api/sales-stats/hourly?period=${period}`);
    }

    // Staff calls
    async getStaffCalls() {
        return this.request('/api/staff-calls');
    }

    async createStaffCall(callData) {
        return this.request('/api/staff-calls', {
            method: 'POST',
            body: JSON.stringify(callData),
        });
    }

    async updateStaffCallStatus(callId, status) {
        return this.request(`/api/staff-calls/${callId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status }),
        });
    }

    // Health check
    async healthCheck() {
        return this.request('/api/health');
    }
}

// Export singleton instance
const apiClient = new APIClient();

// Made with Bob
