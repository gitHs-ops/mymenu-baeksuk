const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
require('dotenv').config();

// Only require database if DB credentials are provided
// Support both custom env vars and Railway's default MySQL vars
let pool, testConnection, initializeDatabase;
const USE_DATABASE = (process.env.DB_HOST || process.env.MYSQLHOST) &&
                     (process.env.DB_USER || process.env.MYSQLUSER);

// In-memory storage for development without database
let memoryOrders = [];
let staffCalls = [];

if (USE_DATABASE) {
    const db = require('./database/db');
    pool = db.pool;
    testConnection = db.testConnection;
    initializeDatabase = db.initializeDatabase;
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// Serve static files
app.use(express.static('.', {
    index: false,
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html');
        } else if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// WebSocket connections
const clients = new Set();

wss.on('connection', (ws) => {
    console.log('New WebSocket client connected');
    clients.add(ws);

    ws.on('close', () => {
        console.log('WebSocket client disconnected');
        clients.delete(ws);
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        clients.delete(ws);
    });
});

// Broadcast to all connected clients
function broadcast(data) {
    const message = JSON.stringify(data);
    clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get all orders
app.get('/api/orders', async (req, res) => {
    if (!USE_DATABASE) {
        // Use in-memory storage
        const { status, date } = req.query;
        let filteredOrders = memoryOrders;

        if (date) {
            filteredOrders = filteredOrders.filter(o => (o.created_at || '').startsWith(date));
        }

        if (status && status !== 'all') {
            filteredOrders = filteredOrders.filter(o => o.status === status);
        }

        return res.json(filteredOrders);
    }

    try {
        const { status, date } = req.query;

        // Get orders
        let orderQuery = 'SELECT * FROM orders';
        let orderParams = [];
        const conditions = [];

        if (date) {
            conditions.push('DATE(created_at) = ?');
            orderParams.push(date);
        }

        if (status && status !== 'all') {
            conditions.push('status = ?');
            orderParams.push(status);
        }

        if (conditions.length > 0) {
            orderQuery += ' WHERE ' + conditions.join(' AND ');
        }

        orderQuery += ' ORDER BY created_at DESC';
        
        const [orders] = await pool.query(orderQuery, orderParams);
        
        // Get items for each order
        for (const order of orders) {
            const [items] = await pool.query(
                'SELECT item_name as name, price, quantity FROM order_items WHERE order_id = ?',
                [order.id]
            );
            order.items = items;
        }
        
        res.json(orders);
    } catch (error) {
        console.error('Error fetching orders:', error);
        console.error('Error details:', error.message);
        res.status(500).json({ error: 'Failed to fetch orders', details: error.message });
    }
});

// Get orders by table number
app.get('/api/orders/table/:tableNumber', async (req, res) => {
    const { tableNumber } = req.params;
    
    if (!USE_DATABASE) {
        // Use in-memory storage
        const tableOrders = memoryOrders.filter(o => o.table_number === parseInt(tableNumber));
        return res.json(tableOrders);
    }
    
    try {
        // Get orders for specific table
        const [orders] = await pool.query(
            'SELECT * FROM orders WHERE table_number = ? ORDER BY created_at DESC',
            [tableNumber]
        );
        
        // Get items for each order
        for (const order of orders) {
            const [items] = await pool.query(
                'SELECT item_name as name, price, quantity FROM order_items WHERE order_id = ?',
                [order.id]
            );
            order.items = items;
        }
        
        res.json(orders);
    } catch (error) {
        console.error('Error fetching table orders:', error);
        res.status(500).json({ error: 'Failed to fetch table orders', details: error.message });
    }
});

// Get single order
app.get('/api/orders/:id', async (req, res) => {
    if (!USE_DATABASE) {
        // Use in-memory storage
        const order = memoryOrders.find(o => o.id === req.params.id);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        return res.json(order);
    }
    
    try {
        const { id } = req.params;
        
        // Get order
        const [orders] = await pool.query('SELECT * FROM orders WHERE id = ?', [id]);
        
        if (orders.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        const order = orders[0];
        
        // Get items
        const [items] = await pool.query(
            'SELECT item_name as name, price, quantity FROM order_items WHERE order_id = ?',
            [id]
        );
        order.items = items;
        
        res.json(order);
    } catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({ error: 'Failed to fetch order', details: error.message });
    }
});

// Create new order
app.post('/api/orders', async (req, res) => {
    const { id, tableNumber, items, total, timestamp } = req.body;
    
    if (!USE_DATABASE) {
        // Use in-memory storage
        const newOrder = {
            id,
            table_number: tableNumber,
            items,
            total,
            status: 'pending',
            created_at: timestamp || new Date().toISOString()
        };
        
        memoryOrders.unshift(newOrder);
        
        // Broadcast new order to all connected clients
        broadcast({
            type: 'new_order',
            order: newOrder
        });
        
        return res.status(201).json({ success: true, orderId: id });
    }
    
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        // Convert ISO string to MySQL datetime format
        const createdAt = timestamp ? new Date(timestamp) : new Date();
        
        // Insert order
        await connection.query(
            'INSERT INTO orders (id, table_number, total, status, created_at) VALUES (?, ?, ?, ?, ?)',
            [id, tableNumber, total, 'pending', createdAt]
        );
        
        // Insert order items
        for (const item of items) {
            await connection.query(
                'INSERT INTO order_items (order_id, item_name, price, quantity) VALUES (?, ?, ?, ?)',
                [id, item.name, item.price, item.quantity]
            );
        }
        
        await connection.commit();
        
        // Broadcast new order to all connected clients
        broadcast({
            type: 'new_order',
            order: {
                id,
                tableNumber,
                items,
                total,
                status: 'pending',
                timestamp: timestamp || new Date()
            }
        });
        
        res.status(201).json({ success: true, orderId: id });
    } catch (error) {
        await connection.rollback();
        console.error('Error creating order:', error);
        res.status(500).json({ error: 'Failed to create order' });
    } finally {
        connection.release();
    }
});

// Update order status
app.patch('/api/orders/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!USE_DATABASE) {
        // Use in-memory storage
        const order = memoryOrders.find(o => o.id === id);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        order.status = status;
        if (status === 'completed') {
            order.completed_at = new Date().toISOString();
        }
        
        // Broadcast status update
        broadcast({
            type: 'order_status_update',
            orderId: id,
            status,
            completedAt: order.completed_at
        });
        
        return res.json({ success: true });
    }
    
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        if (!['pending', 'cooking', 'completed', 'cancelled'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        
        const completedAt = status === 'completed' ? new Date() : null;
        
        await pool.query(
            'UPDATE orders SET status = ?, completed_at = ? WHERE id = ?',
            [status, completedAt, id]
        );
        
        // Broadcast status update
        broadcast({
            type: 'order_status_update',
            orderId: id,
            status,
            completedAt
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

// Delete order
app.delete('/api/orders/:id', async (req, res) => {
    const { id } = req.params;
    
    if (!USE_DATABASE) {
        // Use in-memory storage
        const index = memoryOrders.findIndex(o => o.id === id);
        if (index === -1) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        memoryOrders.splice(index, 1);
        
        // Broadcast deletion
        broadcast({
            type: 'order_deleted',
            orderId: id
        });
        
        return res.json({ success: true });
    }
    
    try {
        const { id } = req.params;
        
        await pool.query('DELETE FROM orders WHERE id = ?', [id]);
        
        // Broadcast deletion
        broadcast({
            type: 'order_deleted',
            orderId: id
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting order:', error);
        res.status(500).json({ error: 'Failed to delete order' });
    }
});

// Delete completed orders
app.delete('/api/orders/completed/all', async (req, res) => {
    if (!USE_DATABASE) {
        // Use in-memory storage
        const completedCount = memoryOrders.filter(o => o.status === 'completed').length;
        memoryOrders = memoryOrders.filter(o => o.status !== 'completed');
        
        broadcast({
            type: 'completed_orders_cleared',
            count: completedCount
        });
        
        return res.json({ success: true, deletedCount: completedCount });
    }
    
    try {
        const [result] = await pool.query('DELETE FROM orders WHERE status = ?', ['completed']);
        
        broadcast({
            type: 'completed_orders_cleared',
            count: result.affectedRows
        });
        
        res.json({ success: true, deletedCount: result.affectedRows });
    } catch (error) {
        console.error('Error deleting completed orders:', error);
        res.status(500).json({ error: 'Failed to delete completed orders' });
    }
});

// Get statistics
app.get('/api/statistics', async (req, res) => {
    if (!USE_DATABASE) {
        // Use in-memory storage
        const stats = {
            total_orders: memoryOrders.length,
            pending_orders: memoryOrders.filter(o => o.status === 'pending').length,
            cooking_orders: memoryOrders.filter(o => o.status === 'cooking').length,
            completed_orders: memoryOrders.filter(o => o.status === 'completed').length,
            total_revenue: memoryOrders.reduce((sum, o) => sum + parseFloat(o.total), 0)
        };
        
        return res.json(stats);
    }
    
    try {
        const [stats] = await pool.query(`
            SELECT 
                COUNT(*) as total_orders,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
                SUM(CASE WHEN status = 'cooking' THEN 1 ELSE 0 END) as cooking_orders,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
                SUM(total) as total_revenue
            FROM orders
            WHERE DATE(created_at) = CURDATE()
        `);
        
        res.json(stats[0]);
    } catch (error) {
        console.error('Error fetching statistics:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Staff call endpoints
app.get('/api/staff-calls', async (req, res) => {
    if (!USE_DATABASE) {
        return res.json(staffCalls);
    }
    
    try {
        const [calls] = await pool.query(
            'SELECT * FROM staff_calls WHERE status = ? ORDER BY created_at DESC',
            ['pending']
        );
        res.json(calls);
    } catch (error) {
        console.error('Error fetching staff calls:', error);
        res.status(500).json({ error: 'Failed to fetch staff calls' });
    }
});

app.post('/api/staff-calls', async (req, res) => {
    const { tableNumber, message } = req.body;
    
    if (!USE_DATABASE) {
        const newCall = {
            id: 'call_' + Date.now(),
            table_number: tableNumber,
            message,
            status: 'pending',
            created_at: new Date().toISOString()
        };
        
        staffCalls.unshift(newCall);
        
        // Broadcast to admin
        broadcast({
            type: 'staff_call',
            call: newCall
        });
        
        return res.status(201).json({ success: true, callId: newCall.id });
    }
    
    try {
        const callId = 'call_' + Date.now();
        
        await pool.query(
            'INSERT INTO staff_calls (id, table_number, message, status) VALUES (?, ?, ?, ?)',
            [callId, tableNumber, message, 'pending']
        );
        
        // Broadcast to admin
        broadcast({
            type: 'staff_call',
            call: {
                id: callId,
                table_number: tableNumber,
                message,
                status: 'pending',
                created_at: new Date()
            }
        });
        
        res.status(201).json({ success: true, callId });
    } catch (error) {
        console.error('Error creating staff call:', error);
        res.status(500).json({ error: 'Failed to create staff call' });
    }
});

app.patch('/api/staff-calls/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!USE_DATABASE) {
        const call = staffCalls.find(c => c.id === id);
        if (!call) {
            return res.status(404).json({ error: 'Staff call not found' });
        }
        
        call.status = status;
        
        broadcast({
            type: 'staff_call_update',
            callId: id,
            status
        });
        
        return res.json({ success: true });
    }
    
    try {
        await pool.query(
            'UPDATE staff_calls SET status = ? WHERE id = ?',
            [status, id]
        );
        
        broadcast({
            type: 'staff_call_update',
            callId: id,
            status
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating staff call:', error);
        res.status(500).json({ error: 'Failed to update staff call' });
    }
});

// Serve HTML files
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.get('/admin', (req, res) => {
    res.sendFile(__dirname + '/admin.html');
});

app.get('/qr-generator', (req, res) => {
    res.sendFile(__dirname + '/qr-generator.html');
});

// Initialize and start server
const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        if (USE_DATABASE) {
            console.log('🔌 Connecting to MySQL database...');
            // Test database connection
            await testConnection();
            
            // Initialize database tables
            await initializeDatabase();
            console.log('✅ Database connected and initialized');
        } else {
            console.log('⚠️  Running without database (Railway will provide DB credentials)');
            console.log('💡 Set DB_HOST and DB_USER in environment variables to enable database');
        }
        
        // Start server
        server.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📱 Customer app: http://localhost:${PORT}/`);
            console.log(`🏪 Admin app: http://localhost:${PORT}/admin`);
            console.log(`📱 QR Generator: http://localhost:${PORT}/qr-generator`);
            
            if (!USE_DATABASE) {
                console.log('\n⚠️  Database not configured - Deploy to Railway to enable full functionality');
            }
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        if (USE_DATABASE) {
            console.log('\n💡 Tip: Check your database credentials in .env file');
            console.log('💡 Or deploy to Railway for automatic database setup');
        }
        process.exit(1);
    }
}

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing server...');
    server.close(() => {
        console.log('Server closed');
        if (USE_DATABASE && pool) {
            pool.end();
        }
        process.exit(0);
    });
});

// Made with Bob
